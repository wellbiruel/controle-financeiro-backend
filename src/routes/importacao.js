const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const { Readable } = require('stream');

const db = require('../config/database');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const authenticateToken = require('../middleware/authMiddleware');

function validarSaida(row, idx) {
  const erros = [];
  const avisos = [];
  const item = String(row['Item'] || row['A'] || '').trim();
  const valorRaw = String(row['Valor'] || row['B'] || '').trim().replace(',', '.');
  const mesRaw = String(row['Mês'] || row['Mes'] || row['C'] || '').trim();
  const categoria = String(row['Categoria'] || row['D'] || '').trim();
  const anoRaw = String(row['Ano'] || row['E'] || '').trim();

  if (!item) erros.push('Item não pode ser vazio');
  const valor = parseFloat(valorRaw);
  if (isNaN(valor) || valor <= 0) erros.push('Valor inválido — deve ser número positivo');
  const mes = parseInt(mesRaw, 10);
  if (isNaN(mes) || mes < 1 || mes > 12) erros.push('Mês inválido — deve ser entre 1 e 12');
  const ano = parseInt(anoRaw, 10);
  if (isNaN(ano)) erros.push('Ano inválido');
  if (!isNaN(ano) && ano !== new Date().getFullYear()) avisos.push(`Ano ${ano} é diferente do ano atual (${new Date().getFullYear()})`);
  if (!categoria) avisos.push('Categoria não informada — será importado sem categoria');

  return {
    idx: idx + 2,
    item,
    valor: isNaN(valor) ? null : valor,
    mes: isNaN(mes) ? null : mes,
    categoria,
    ano: isNaN(ano) ? null : ano,
    erros,
    avisos,
    status: erros.length > 0 ? 'erro' : avisos.length > 0 ? 'aviso' : 'ok',
  };
}

function validarEntrada(row, idx) {
  const erros = [];
  const avisos = [];
  const entradaRaw = String(row['Entrada'] || row['A'] || '').trim().replace(',', '.');
  const tipo = String(row['Tipo'] || row['B'] || '').trim().toLowerCase();
  const mesRaw = String(row['Mês'] || row['Mes'] || row['C'] || '').trim();
  const anoRaw = String(row['Ano'] || row['D'] || '').trim();

  const valor = parseFloat(entradaRaw);
  if (isNaN(valor) || valor <= 0) erros.push('Valor de entrada inválido');
  const mes = parseInt(mesRaw, 10);
  if (isNaN(mes) || mes < 1 || mes > 12) erros.push('Mês inválido — deve ser entre 1 e 12');
  const ano = parseInt(anoRaw, 10);
  if (isNaN(ano)) erros.push('Ano inválido');
  if (!isNaN(ano) && ano !== new Date().getFullYear()) avisos.push(`Ano ${ano} diferente do atual`);
  const tiposValidos = ['salário', 'salario', 'renda extra', 'outro', 'outros'];
  if (tipo && !tiposValidos.includes(tipo)) avisos.push(`Tipo "${tipo}" não reconhecido — será salvo como "outro"`);

  return {
    idx: idx + 2,
    valor: isNaN(valor) ? null : valor,
    tipo: tipo || 'outro',
    mes: isNaN(mes) ? null : mes,
    ano: isNaN(ano) ? null : ano,
    erros,
    avisos,
    status: erros.length > 0 ? 'erro' : avisos.length > 0 ? 'aviso' : 'ok',
  };
}

async function lerArquivo(buffer, originalname) {
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

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headerRow = worksheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    let value = String(cell.value || '').trim();
    if (!value) {
      value = String.fromCharCode(64 + colNumber);
    }
    headers.push(value);
  });

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const rowObj = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber - 1] || String.fromCharCode(64 + colNumber);
      rowObj[key] = cell.value == null ? '' : String(cell.value).trim();
    });
    if (Object.values(rowObj).some((value) => value !== '')) {
      rows.push(rowObj);
    }
  });

  return rows;
}

router.post('/preview', authenticateToken, upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const tipo = req.body.tipo;
    const rows = await lerArquivo(req.file.buffer, req.file.originalname);
    if (rows.length === 0) return res.status(400).json({ error: 'Planilha vazia ou formato inválido' });

    const linhas = tipo === 'entrada'
      ? rows.map((r, i) => validarEntrada(r, i))
      : rows.map((r, i) => validarSaida(r, i));

    const total = linhas.length;
    const validas = linhas.filter((l) => l.status !== 'erro').length;
    const avisos = linhas.filter((l) => l.status === 'aviso').length;
    const erros = linhas.filter((l) => l.status === 'erro').length;

    res.json({ tipo, linhas, total, validas, avisos, erros });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao processar arquivo' });
  }
});

router.post('/confirmar', authenticateToken, upload.single('arquivo'), async (req, res) => {
  const usuarioId = req.userId;
  const tipo = req.body.tipo;
  const client = await db.connect();

  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const rows = await lerArquivo(req.file.buffer, req.file.originalname);
    const linhas = tipo === 'entrada'
      ? rows.map((r, i) => validarEntrada(r, i))
      : rows.map((r, i) => validarSaida(r, i));

    await client.query('BEGIN');
    let importados = 0;

    if (tipo !== 'entrada') {
      for (const linha of linhas) {
        if (linha.status === 'erro') continue;

        let itemRes = await client.query(
          `SELECT i.id FROM itens_financeiros i
           JOIN grupos_financeiros g ON i.grupo_id = g.id
           WHERE LOWER(i.nome) = LOWER($1) AND g.usuario_id = $2
           LIMIT 1`,
          [linha.item, usuarioId]
        );

        let itemId;
        if (itemRes.rows.length === 0) {
          let grupoRes = await client.query(
            `SELECT id FROM grupos_financeiros WHERE LOWER(nome) = LOWER($1) AND usuario_id = $2 LIMIT 1`,
            [linha.categoria || 'Outros', usuarioId]
          );
          let grupoId;
          if (grupoRes.rows.length === 0) {
            const novoGrupo = await client.query(
              `INSERT INTO grupos_financeiros (nome, usuario_id) VALUES ($1, $2) RETURNING id`,
              [linha.categoria || 'Outros', usuarioId]
            );
            grupoId = novoGrupo.rows[0].id;
          } else {
            grupoId = grupoRes.rows[0].id;
          }

          const novoItem = await client.query(
            `INSERT INTO itens_financeiros (nome, grupo_id, tipo) VALUES ($1, $2, 'fixo') RETURNING id`,
            [linha.item, grupoId]
          );
          itemId = novoItem.rows[0].id;
        } else {
          itemId = itemRes.rows[0].id;
        }

        await client.query(
          `INSERT INTO lancamentos_mensais (item_id, usuario_id, mes, ano, valor)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (item_id, mes, ano) DO UPDATE SET valor = EXCLUDED.valor`,
          [itemId, usuarioId, linha.mes, linha.ano, linha.valor]
        );
        importados++;
      }
    } else {
      for (const linha of linhas) {
        if (linha.status === 'erro') continue;
        const data = `${linha.ano}-${String(linha.mes).padStart(2, '0')}-01`;
        await client.query(
          `INSERT INTO transacoes (usuario_id, tipo, valor, data, descricao)
           VALUES ($1, 'entrada', $2, $3, $4)`,
          [usuarioId, linha.valor, data, linha.tipo || 'Salário']
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

router.get('/modelo/:tipo?', async (req, res) => {
  const tipo = req.params.tipo || 'saida';
  const { formato } = req.query;

  const data = tipo === 'saida'
    ? [
      { Item: 'Mercado Cooper', Valor: 508.00, Mês: 2, Categoria: 'Mercado', Ano: new Date().getFullYear() },
      { Item: 'C6', Valor: 3476.00, Mês: 2, Categoria: 'Cartões', Ano: new Date().getFullYear() },
      { Item: 'Internet', Valor: 122.00, Mês: 3, Categoria: 'Casa', Ano: new Date().getFullYear() },
    ]
    : [
      { Entrada: 6626.00, Tipo: 'Salário', Mês: 3, Ano: new Date().getFullYear() },
      { Entrada: 500.00, Tipo: 'Renda Extra', Mês: 3, Ano: new Date().getFullYear() },
    ];

  const sheetName = tipo === 'saida' ? 'Saídas' : 'Entradas';
  const filename = `modelo_${tipo === 'saida' ? 'saidas' : 'entradas'}.${formato || 'xlsx'}`;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.columns = Object.keys(data[0]).map((key) => ({ header: key, key }));
  worksheet.addRows(data);

  if (formato === 'csv') {
    const csv = await workbook.csv.writeBuffer();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } else {
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
});

module.exports = router;
