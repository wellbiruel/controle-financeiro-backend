import React, { useState, useRef } from 'react';
import Layout from '../components/Layout/Layout';
import api from '../services/api';

const STEPS = ['Baixar modelo', 'Preencher planilha', 'Upload e revisão', 'Confirmar importação'];

export default function ImportacaoPage() {
  const [step, setStep] = useState(0);
  const [tipo, setTipo] = useState('saida');
  const [arquivo, setArquivo] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const fileRef = useRef();

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const baixarModelo = (formato) => {
    window.open(`${process.env.REACT_APP_API_URL || 'https://controle-financeiro-backend-production.up.railway.app'}/importacao/modelo/${tipo}?formato=${formato}`, '_blank');
  };

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'csv'].includes(ext)) {
      setErro('Formato inválido. Use .xlsx ou .csv');
      return;
    }
    setArquivo(file);
    setErro('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('arquivo', file);
      fd.append('tipo', tipo);
      const res = await api.post('/importacao/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setPreview(res.data);
      setStep(2);
    } catch (e) {
      setErro(e.response?.data?.error || 'Erro ao processar arquivo');
    }
    setLoading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const confirmarImportacao = async () => {
    if (!preview) return;
    setLoading(true);
    setErro('');
    try {
      const linhasValidas = preview.linhas.filter(l => l.status !== 'erro');
      const res = await api.post('/importacao/confirmar', {
        tipo,
        linhas: linhasValidas,
        usuario_id: user.id,
        ano: new Date().getFullYear(),
      });
      setSucesso(`${res.data.importados} registros importados com sucesso!`);
      setStep(3);
    } catch (e) {
      setErro(e.response?.data?.error || 'Erro ao confirmar importação');
    }
    setLoading(false);
  };

  const reiniciar = () => {
    setStep(0); setArquivo(null); setPreview(null);
    setErro(''); setSucesso('');
  };

  const S = {
    page: { padding: '12px 20px', background: '#F5F5F5', minHeight: '100vh' },
    card: { background: 'white', borderRadius: '4px', padding: '16px 18px', marginBottom: '10px' },
    title: { fontSize: '13px', fontWeight: '600', color: '222' },
    sub: { fontSize: '10px', color: '#9E9E9E', marginTop: '2px', lineHeight: '1.5' },
    btn: (variant) => ({
      padding: '7px 16px', borderRadius: '3px', fontSize: '11px',
      cursor: 'pointer', fontWeight: '500', border: 'none',
      background: variant === 'primary' ? '#1B3A6B' : variant === 'danger' ? '#FEF2F2' : 'white',
      color: variant === 'primary' ? 'white' : variant === 'danger' ? '#991B1B' : '#555',
      border: variant === 'secondary' ? '1px solid #E0E0E0' : variant === 'danger' ? '1px solid #FECACA' : 'none',
    }),
  };

  return (
    <Layout>
      <div style={S.page}>
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#222' }}>Importar Dados</div>
          <div style={{ fontSize: '10px', color: '#9E9E9E', marginTop: '2px' }}>Importe suas transações em massa via planilha Excel ou CSV</div>
        </div>

        {/* Steps */}
        <div style={{ background: 'white', borderRadius: '4px', padding: '10px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
          {STEPS.map((s, i) => (
            <React.Fragment key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '600',
                  background: i < step ? '#16A34A' : i === step ? '#1B3A6B' : '#F0F0F0',
                  color: i <= step ? 'white' : '#9E9E9E',
                }}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: '10px', color: i === step ? '#1B3A6B' : i < step ? '#16A34A' : '#9E9E9E', fontWeight: i === step ? '500' : '400', whiteSpace: 'nowrap' }}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <div style={{ flex: 1, height: '1px', background: '#F0F0F0', margin: '0 8px' }} />}
            </React.Fragment>
          ))}
        </div>

        {/* STEP 0 e 1: Modelo + Upload */}
        {step < 2 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>

            {/* Download modelo */}
            <div style={S.card}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#334155', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📥</span> 1. Baixe o modelo da planilha
              </div>
              <div style={{ fontSize: '10px', color: '#9E9E9E', marginBottom: '12px' }}>Escolha o tipo, baixe o modelo e preencha com seus dados.</div>

              {/* Tipo */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                {[['saida', 'Saídas / Gastos', 'Item, Valor, Mês, Categoria, Ano'], ['entrada', 'Entradas / Receitas', 'Entrada, Tipo, Mês, Ano']].map(([v, l, sub]) => (
                  <div key={v} onClick={() => setTipo(v)} style={{
                    flex: 1, padding: '8px 10px', borderRadius: '4px', cursor: 'pointer', textAlign: 'center',
                    border: tipo === v ? '2px solid #1B3A6B' : '1px solid #E2E8F0',
                    background: tipo === v ? '#EFF6FF' : 'white',
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: '600', color: tipo === v ? '#1B3A6B' : '#555' }}>{l}</div>
                    <div style={{ fontSize: '9px', color: '#9E9E9E', marginTop: '2px' }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Botões download */}
              {[['xlsx', 'XLS', '#D1FAE5', '#065F46'], ['csv', 'CSV', '#DBEAFE', '#1E40AF']].map(([fmt, label, bg, color]) => (
                <div key={fmt} onClick={() => { baixarModelo(fmt); setStep(s => Math.max(s, 1)); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: '4px', cursor: 'pointer', marginBottom: '6px' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>{label}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', fontWeight: '500', color: '#334155' }}>modelo_{tipo}s.{fmt}</div>
                    <div style={{ fontSize: '9px', color: '#9E9E9E' }}>{fmt === 'xlsx' ? 'Excel · com exemplos' : 'CSV · compatível com qualquer editor'}</div>
                  </div>
                  <span style={{ color: '#9E9E9E' }}>↓</span>
                </div>
              ))}

              {/* Preview mini */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '3px', overflow: 'hidden', marginTop: '10px' }}>
                <div style={{ background: '#F8FAFC', padding: '4px 8px', fontSize: '9px', fontWeight: '600', color: '#64748B', borderBottom: '1px solid #E2E8F0' }}>
                  Colunas do modelo — {tipo === 'saida' ? 'Saídas' : 'Entradas'}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F1F5F9' }}>
                      {(tipo === 'saida'
                        ? ['A — Item', 'B — Valor', 'C — Mês', 'D — Categoria', 'E — Ano']
                        : ['A — Entrada', 'B — Tipo', 'C — Mês', 'D — Ano']
                      ).map(col => <th key={col} style={{ padding: '4px 8px', fontSize: '8px', fontWeight: '600', color: '#64748B', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>{col}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(tipo === 'saida' ? [
                      ['Mercado Cooper', '508,00', '2', 'Mercado', '2026'],
                      ['C6', '3.476,00', '2', 'Cartões', '2026'],
                    ] : [
                      ['6.626,00', 'Salário', '3', '2026'],
                      ['500,00', 'Renda Extra', '3', '2026'],
                    ]).map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{ padding: '3px 8px', fontSize: '9px', color: '#9E9E9E', fontStyle: 'italic', borderBottom: '1px solid #FAFAFA' }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Upload */}
            <div style={S.card}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#334155', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📤</span> 2. Faça o upload da planilha preenchida
              </div>
              <div style={{ fontSize: '10px', color: '#9E9E9E', marginBottom: '12px' }}>Após preencher o modelo, envie o arquivo aqui.</div>

              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#3B82F6' : '#CBD5E1'}`,
                  borderRadius: '6px', padding: '28px', textAlign: 'center', cursor: 'pointer',
                  background: dragOver ? '#F0F6FF' : 'white', transition: 'all .15s',
                }}>
                <div style={{ width: '40px', height: '40px', background: '#EFF6FF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#3B82F6"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
                </div>
                <div style={{ fontSize: '12px', fontWeight: '500', color: '#334155', marginBottom: '4px' }}>
                  {loading ? 'Processando...' : 'Arraste o arquivo aqui'}
                </div>
                <div style={{ fontSize: '10px', color: '#9E9E9E' }}>
                  ou <span style={{ color: '#3B82F6' }}>clique para selecionar</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '10px' }}>
                  {['xlsx', 'csv'].map(f => (
                    <span key={f} style={{ fontSize: '9px', padding: '2px 8px', borderRadius: '10px', fontWeight: '500', background: f === 'xlsx' ? '#D1FAE5' : '#DBEAFE', color: f === 'xlsx' ? '#065F46' : '#1E40AF' }}>.{f}</span>
                  ))}
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.csv" style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])} />

              {arquivo && !loading && (
                <div style={{ marginTop: '8px', padding: '8px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: '#166534' }}>
                  <span>✓</span> {arquivo.name} carregado
                </div>
              )}

              {erro && (
                <div style={{ marginTop: '8px', padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', fontSize: '10px', color: '#991B1B' }}>
                  ✕ {erro}
                </div>
              )}

              <div style={{ marginTop: '12px', padding: '10px', background: '#F8FAFC', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '10px', fontWeight: '500', color: '#334155', marginBottom: '5px' }}>Dicas importantes:</div>
                <div style={{ fontSize: '9px', color: '#64748B', lineHeight: '1.7' }}>
                  • Não altere os nomes das colunas do modelo<br />
                  • Valores: use ponto como decimal (ex: 350.00)<br />
                  • Mês deve ser número entre 1 e 12<br />
                  • Categoria deve corresponder a um grupo cadastrado
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Preview */}
        {step === 2 && preview && (
          <>
            {/* Resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '10px' }}>
              {[['Total de linhas', preview.total, '#222'], ['Prontas para importar', preview.validas, '#16A34A'], ['Com avisos', preview.avisos, '#F59E0B'], ['Com erros', preview.erros, '#EF4444']].map(([l, v, c]) => (
                <div key={l} style={{ background: 'white', borderRadius: '4px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '9px', color: '#9E9E9E', marginBottom: '3px' }}>{l}</div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: c }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Tabela preview */}
            <div style={{ background: 'white', borderRadius: '4px', overflow: 'hidden', marginBottom: '10px' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #F0F0F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#334155' }}>Prévia — {arquivo?.name}</div>
                  <div style={{ fontSize: '9px', color: '#9E9E9E', marginTop: '1px' }}>{preview.total} linhas encontradas · verifique antes de importar</div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[['ok', '#F0FDF4', '#166534', `${preview.validas} válidas`], ['aviso', '#FFFBEB', '#92400E', `${preview.avisos} avisos`], ['erro', '#FEF2F2', '#991B1B', `${preview.erros} erros`]].map(([k, bg, c, l]) => (
                    <span key={k} style={{ fontSize: '9px', padding: '2px 8px', borderRadius: '10px', background: bg, color: c }}>{l}</span>
                  ))}
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#FAFAFA' }}>
                      <th style={{ padding: '5px 6px', fontSize: '8px', color: '#BDBDBD', width: '30px', borderBottom: '1px solid #F0F0F0' }}>#</th>
                      {(tipo === 'saida'
                        ? ['Item', 'Valor', 'Mês', 'Categoria', 'Ano']
                        : ['Valor', 'Tipo', 'Mês', 'Ano']
                      ).map(h => <th key={h} style={{ padding: '5px 10px', fontSize: '9px', fontWeight: '600', color: '#9E9E9E', background: '#FAFAFA', borderBottom: '1px solid #F0F0F0', textAlign: 'left' }}>{h}</th>)}
                      <th style={{ padding: '5px 10px', fontSize: '9px', fontWeight: '600', color: '#9E9E9E', background: '#FAFAFA', borderBottom: '1px solid #F0F0F0' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.linhas.map((linha, i) => (
                      <React.Fragment key={i}>
                        <tr style={{ borderLeft: `3px solid ${linha.status === 'erro' ? '#EF4444' : linha.status === 'aviso' ? '#F59E0B' : 'transparent'}` }}>
                          <td style={{ padding: '4px 6px', fontSize: '9px', color: '#BDBDBD', textAlign: 'center', borderBottom: '1px solid #FAFAFA' }}>{linha.idx}</td>
                          {(tipo === 'saida' ? [
                            linha.item, `R$ ${(linha.valor || 0).toFixed(2)}`,
                            linha.mes, linha.categoria, linha.ano
                          ] : [
                            `R$ ${(linha.valor || 0).toFixed(2)}`, linha.tipo, linha.mes, linha.ano
                          ]).map((cell, ci) => (
                            <td key={ci} style={{ padding: '4px 10px', fontSize: '10px', color: '#424242', borderBottom: '1px solid #FAFAFA' }}>{cell}</td>
                          ))}
                          <td style={{ padding: '4px 10px', borderBottom: '1px solid #FAFAFA' }}>
                            <span style={{ fontSize: '9px', color: linha.status === 'erro' ? '#EF4444' : linha.status === 'aviso' ? '#F59E0B' : '#16A34A' }}>
                              {linha.status === 'erro' ? '✕ erro' : linha.status === 'aviso' ? '⚠ aviso' : '✓ ok'}
                            </span>
                          </td>
                        </tr>
                        {linha.erros.map((e, ei) => (
                          <tr key={`e${ei}`}>
                            <td colSpan={tipo === 'saida' ? 7 : 6} style={{ padding: '3px 10px', background: '#FEF2F2', borderTop: '1px solid #FECACA', fontSize: '9px', color: '#991B1B' }}>✕ {e}</td>
                          </tr>
                        ))}
                        {linha.avisos.map((a, ai) => (
                          <tr key={`a${ai}`}>
                            <td colSpan={tipo === 'saida' ? 7 : 6} style={{ padding: '3px 10px', background: '#FFFBEB', borderTop: '1px solid #FDE68A', fontSize: '9px', color: '#92400E' }}>⚠ {a}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={confirmarImportacao} disabled={loading} style={S.btn('primary')}>
                {loading ? 'Importando...' : `Importar ${preview.validas} linha${preview.validas !== 1 ? 's' : ''} válida${preview.validas !== 1 ? 's' : ''}`}
              </button>
              <button onClick={reiniciar} style={S.btn('secondary')}>← Voltar</button>
              {preview.erros > 0 && (
                <span style={{ fontSize: '10px', color: '#9E9E9E' }}>{preview.erros} linha{preview.erros > 1 ? 's' : ''} com erro ser{preview.erros > 1 ? 'ão' : 'á'} ignorada{preview.erros > 1 ? 's' : ''}</span>
              )}
            </div>
          </>
        )}

        {/* STEP 3: Sucesso */}
        {step === 3 && (
          <div style={{ background: 'white', borderRadius: '4px', padding: '40px', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', background: '#F0FDF4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: '20px' }}>✓</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#166534', marginBottom: '6px' }}>{sucesso}</div>
            <div style={{ fontSize: '11px', color: '#9E9E9E', marginBottom: '20px' }}>Os dados já estão disponíveis no Fluxo Anual e Transações.</div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button onClick={reiniciar} style={S.btn('primary')}>Importar mais dados</button>
              <button onClick={() => window.location.href = '/fluxo'} style={S.btn('secondary')}>Ver Fluxo Anual</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
