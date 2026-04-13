const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');
const { Readable } = require('stream');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const authenticateToken = require('../middleware/authMiddleware');

// ─── Detecção de tipo pela primeira coluna ────────────────────────────────────
function detectarTipo(headers) {
  if (!headers || headers.length === 0) return null;
  if (headers[0] === 'Item') return 'saida';
  if (headers[0] === 'Valor' && headers.includes('Tipo')) return 'entrada';
  return null;
}

// ─── Validação e normalização ─────────────────────────────────────────────────
function validarSaida(row, lineNumber) {
  const erros = [];
  const avisos = [];
  const item     = String(row['Item']      || row['A'] || '').trim();
  const valorRaw = String(row['Valor']     || row['B'] || '').trim().replace(',', '.');
  const mesRaw   = String(row['Mês'] || row['Mes'] || row['C'] || '').trim();
  const categoria = String(row['Categoria'] || row['D'] || '').trim();
  const anoRaw   = String(row['Ano']       || row['E'] || '').trim();

  if (!item) erros.push('Item não pode ser vazio');
  const valor = parseFloat(valorRaw);
  if (isNaN(valor) || valor <= 0) erros.push('Valor inválido — deve ser número positivo');
  const mes = parseInt(mesRaw, 10);
  if (isNaN(mes) || mes < 1 || mes > 12) erros.push('Mês inválido — deve ser entre 1 e 12');
  const ano = parseInt(anoRaw, 10);
  if (isNaN(ano)) erros.push('Ano inválido');
  if (!isNaN(ano) && ano !== new Date().getFullYear())
    avisos.push(`Ano ${ano} diferente do atual (${new Date().getFullYear()})`);
  if (!categoria) avisos.push('Categoria não informada — importado sem categoria');

  return {
    linha:     lineNumber,
    data:      (!isNaN(mes) && !isNaN(ano)) ? `${String(mes).padStart(2, '0')}/${ano}` : null,
    descricao: item || null,
    categoria: categoria || null,
    tipo:      'saida',
    valor:     isNaN(valor) ? null : valor,
    valida:    erros.length === 0,
    erros,
    avisos,
  };
}

function validarEntrada(row, lineNumber) {
  const erros = [];
  const avisos = [];
  // aceita 'Valor' (novo modelo) ou 'Entrada' (compatibilidade)
  const valorRaw    = String(row['Valor'] || row['Entrada'] || row['A'] || '').trim().replace(',', '.');
  const tipoEntrada = String(row['Tipo']  || row['B'] || '').trim();
  const mesRaw      = String(row['Mês'] || row['Mes'] || row['C'] || '').trim();
  const anoRaw      = String(row['Ano']   || row['D'] || '').trim();

  const valor = parseFloat(valorRaw);
  if (isNaN(valor) || valor <= 0) erros.push('Valor de entrada inválido');
  const mes = parseInt(mesRaw, 10);
  if (isNaN(mes) || mes < 1 || mes > 12) erros.push('Mês inválido — deve ser entre 1 e 12');
  const ano = parseInt(anoRaw, 10);
  if (isNaN(ano)) erros.push('Ano inválido');
  if (!isNaN(ano) && ano !== new Date().getFullYear())
    avisos.push(`Ano ${ano} diferente do atual`);
  const tiposValidos = ['salário', 'salario', 'renda extra', 'outro', 'outros'];
  if (tipoEntrada && !tiposValidos.includes(tipoEntrada.toLowerCase()))
    avisos.push(`Tipo "${tipoEntrada}" não reconhecido`);

  return {
    linha:     lineNumber,
    data:      (!isNaN(mes) && !isNaN(ano)) ? `${String(mes).padStart(2, '0')}/${ano}` : null,
    descricao: tipoEntrada || 'Entrada',
    categoria: 'Entrada',
    tipo:      'entrada',
    valor:     isNaN(valor) ? null : valor,
    valida:    erros.length === 0,
    erros,
    avisos,
  };
}

// ─── Leitura — retorna todas as abas (exceto Exemplos) ───────────────────────
async function lerPlanilha(buffer, originalname) {
  const ext = String(originalname).split('.').pop().toLowerCase();
  const workbook = new ExcelJS.Workbook();

  if (ext === 'csv') {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    await workbook.csv.read(stream);
  } else {
    await workbook.xlsx.load(buffer);
  }

  const sheets = [];
  for (const worksheet of workbook.worksheets) {
    if (worksheet.name === 'Exemplos') continue;

    const headerRow = worksheet.getRow(1);
    const headers = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const value = String(cell.value || '').trim();
      headers.push(value || String.fromCharCode(64 + colNumber));
    });

    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowObj = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const key = headers[colNumber - 1] || String.fromCharCode(64 + colNumber);
        rowObj[key] = cell.value == null ? '' : String(cell.value).trim();
      });
      if (Object.values(rowObj).some((v) => v !== '')) rows.push(rowObj);
    });

    if (rows.length > 0) sheets.push({ name: worksheet.name, headers, rows });
  }

  return sheets;
}

// ─── POST /preview ────────────────────────────────────────────────────────────
router.post('/preview', authenticateToken, upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const sheets = await lerPlanilha(req.file.buffer, req.file.originalname);
    if (sheets.length === 0)
      return res.status(400).json({ error: 'Planilha vazia ou sem dados reconhecidos' });

    let linhas = [];
    let globalLine = 1;
    let total_entradas = 0;
    let total_saidas = 0;

    for (const sheet of sheets) {
      const tipoSheet = detectarTipo(sheet.headers);
      if (!tipoSheet) continue;

      const linhasSheet = sheet.rows.map((row, i) => {
        const lineNumber = globalLine + i + 1; // +1 pela linha de cabeçalho
        return tipoSheet === 'saida'
          ? validarSaida(row, lineNumber)
          : validarEntrada(row, lineNumber);
      });
      globalLine += sheet.rows.length;
      linhas = linhas.concat(linhasSheet);
    }

    if (linhas.length === 0)
      return res.status(400).json({ error: 'Nenhuma linha com dados detectada nas abas' });

    for (const l of linhas) {
      if (!l.valida || l.valor == null) continue;
      if (l.tipo === 'entrada') total_entradas += l.valor;
      else total_saidas += l.valor;
    }

    res.json({
      linhas,
      resumo: {
        total:          linhas.length,
        validas:        linhas.filter((l) => l.valida).length,
        invalidas:      linhas.filter((l) => !l.valida).length,
        total_entradas,
        total_saidas,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao processar arquivo' });
  }
});

// ─── POST /confirmar ──────────────────────────────────────────────────────────
router.post('/confirmar', authenticateToken, upload.single('arquivo'), async (req, res) => {
  const usuario_id = req.userId; // vem do token JWT, não do body
  const client = await pool.connect();

  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    // Re-processa o arquivo (mesma pipeline do preview)
    const sheets = await lerPlanilha(req.file.buffer, req.file.originalname);
    let todasLinhas = [];
    let globalLine = 1;

    for (const sheet of sheets) {
      const tipoSheet = detectarTipo(sheet.headers);
      if (!tipoSheet) continue;
      const linhasSheet = sheet.rows.map((row, i) => {
        const lineNumber = globalLine + i + 1;
        return tipoSheet === 'saida'
          ? validarSaida(row, lineNumber)
          : validarEntrada(row, lineNumber);
      });
      globalLine += sheet.rows.length;
      todasLinhas = todasLinhas.concat(linhasSheet);
    }

    if (todasLinhas.length === 0)
      return res.status(400).json({ error: 'Nenhuma linha com dados encontrada' });

    await client.query('BEGIN');
    let importados = 0;

    for (const linha of todasLinhas) {
      if (!linha.valida) continue; // usa linha.valida (não linha.status)

      // data vem como "MM/AAAA" do validar*
      const [mesStr, anoStr] = (linha.data || '/').split('/');
      const mes = parseInt(mesStr, 10);
      const ano = parseInt(anoStr, 10);

      if (linha.tipo === 'saida') {
        let itemRes = await client.query(
          `SELECT i.id FROM itens_financeiros i
           JOIN grupos_financeiros g ON i.grupo_id = g.id
           WHERE LOWER(i.nome) = LOWER($1) AND g.usuario_id = $2
           LIMIT 1`,
          [linha.descricao, usuario_id]
        );

        let itemId;
        if (itemRes.rows.length === 0) {
          let grupoRes = await client.query(
            `SELECT id FROM grupos_financeiros WHERE LOWER(nome) = LOWER($1) AND usuario_id = $2 LIMIT 1`,
            [linha.categoria || 'Outros', usuario_id]
          );
          let grupoId;
          if (grupoRes.rows.length === 0) {
            const novoGrupo = await client.query(
              `INSERT INTO grupos_financeiros (nome, usuario_id) VALUES ($1, $2) RETURNING id`,
              [linha.categoria || 'Outros', usuario_id]
            );
            grupoId = novoGrupo.rows[0].id;
          } else {
            grupoId = grupoRes.rows[0].id;
          }
          const novoItem = await client.query(
            `INSERT INTO itens_financeiros (nome, grupo_id, tipo) VALUES ($1, $2, 'fixo') RETURNING id`,
            [linha.descricao, grupoId]
          );
          itemId = novoItem.rows[0].id;
        } else {
          itemId = itemRes.rows[0].id;
        }

        await client.query(
          `INSERT INTO lancamentos_mensais (item_id, mes, ano, valor)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (item_id, mes, ano) DO UPDATE SET valor = EXCLUDED.valor`,
          [itemId, mes, ano, linha.valor]
        );
        importados++;
      }

      if (linha.tipo === 'entrada') {
        await client.query(
          `INSERT INTO transacoes (usuario_id, tipo, valor, mes, ano, descricao, categoria)
           VALUES ($1, 'entrada', $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [usuario_id, linha.valor, mes, ano, linha.descricao, 'Entrada']
        );
        importados++;
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, importados });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erro ao importar dados' });
  } finally {
    client.release();
  }
});

// ─── GET /modelo — modelo único com 3 abas ────────────────────────────────────
router.get('/modelo', async (req, res) => {
  const anoAtual = new Date().getFullYear();
  const { formato } = req.query;

  const workbook = new ExcelJS.Workbook();

  const headerStyle = {
    font: { bold: true, color: { argb: 'FF1B3A6B' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } },
  };

  // ── Aba Saídas — apenas cabeçalho ──────────────────────────────────────────
  const wsSaidas = workbook.addWorksheet('Saídas');
  wsSaidas.columns = [
    { header: 'Item',      key: 'Item',      width: 28 },
    { header: 'Valor',     key: 'Valor',     width: 12 },
    { header: 'Mês',       key: 'Mês',       width: 8  },
    { header: 'Categoria', key: 'Categoria', width: 20 },
    { header: 'Ano',       key: 'Ano',       width: 8  },
  ];
  wsSaidas.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));

  // ── Aba Entradas — apenas cabeçalho ────────────────────────────────────────
  const wsEntradas = workbook.addWorksheet('Entradas');
  wsEntradas.columns = [
    { header: 'Valor', key: 'Valor', width: 12 },
    { header: 'Tipo',  key: 'Tipo',  width: 18 },
    { header: 'Mês',   key: 'Mês',   width: 8  },
    { header: 'Ano',   key: 'Ano',   width: 8  },
  ];
  wsEntradas.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));

  // ── Aba Exemplos — dados demonstrativos ────────────────────────────────────
  const wsExemplos = workbook.addWorksheet('Exemplos');
  wsExemplos.columns = [
    { header: 'Item',      key: 'Item',      width: 28 },
    { header: 'Valor',     key: 'Valor',     width: 12 },
    { header: 'Mês',       key: 'Mês',       width: 8  },
    { header: 'Categoria', key: 'Categoria', width: 20 },
    { header: 'Ano',       key: 'Ano',       width: 8  },
    { header: 'Tipo',      key: 'Tipo',      width: 10 },
  ];
  wsExemplos.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));
  wsExemplos.addRows([
    { Item: 'Mercado',     Valor: 450.00,  Mês: 4, Categoria: 'Alimentação', Ano: anoAtual, Tipo: 'saida'   },
    { Item: 'Aluguel',     Valor: 1200.00, Mês: 4, Categoria: 'Moradia',     Ano: anoAtual, Tipo: 'saida'   },
    { Item: 'Internet',    Valor: 120.00,  Mês: 4, Categoria: 'Casa',        Ano: anoAtual, Tipo: 'saida'   },
    { Item: 'Salário',     Valor: 5000.00, Mês: 4, Categoria: 'Entrada',     Ano: anoAtual, Tipo: 'entrada' },
    { Item: 'Renda Extra', Valor: 800.00,  Mês: 4, Categoria: 'Entrada',     Ano: anoAtual, Tipo: 'entrada' },
  ]);

  if (formato === 'csv') {
    const csv = await workbook.csv.writeBuffer();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="modelo_financeiro.csv"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send('\uFEFF' + csv);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="modelo_financeiro.xlsx"');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buffer);
});

module.exports = router;
