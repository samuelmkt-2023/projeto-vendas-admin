// ============================================================
//  admin.js — PROJETO VENDAS Painel Admin
//  Cliente puro (HTML/JS) que chama GitHub API via PAT do user.
//  Token NUNCA fica no codigo — colado no setup, em sessionStorage.
// ============================================================

// ─── SALT FIXO (DEVE BATER com SENHA_SALT no auth_licenca.py) ───
const SENHA_SALT = "83597e550c84215ecb5f6bee1ef49323";

// ─── SENHA MESTRA — escudo contra acesso publico do painel ───
// Hash SHA-256 da senha mestra. Quem tiver a senha consegue ver
// o formulario; atacante fica preso na tela "senha mestra".
const SENHA_MESTRA_HASH =
  "5920c90d41541a1646dffe20bd64440ec5b3d9290056bc996a6290988657c522";

// ─── Estado global ─────────────────────────────────────────────
let token = null;
let repo = null;
let usuariosFile = "usuarios.json";
let branch = "main";
let dadosAtuais = { users: [] };
let sha = null;   // sha do arquivo atual (necessario p/ update)

// ─── SHA-256 helper ───────────────────────────────────────────
async function sha256(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Conectar com GitHub ──────────────────────────────────────
async function conectar() {
  const t = document.getElementById('token-input').value.trim();
  const r = document.getElementById('repo-input').value.trim();
  const lembrar = document.getElementById('lembrar-token').checked;
  const stat = document.getElementById('conn-status');

  if (!t || !r) {
    stat.textContent = '⚠ Preencha token e repo';
    stat.className = 'status-msg err';
    return;
  }

  stat.textContent = '⏳ Validando token...';
  stat.className = 'status-msg';

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${r}/contents/${usuariosFile}?ref=${branch}`,
      { headers: { Authorization: `Bearer ${t}` } }
    );
    if (!resp.ok) {
      if (resp.status === 404) {
        // arquivo nao existe ainda → vamos criar no 1o salvar
        token = t; repo = r; sha = null;
        dadosAtuais = { users: [] };
        if (lembrar) {
          sessionStorage.setItem('pv_admin_token', t);
          sessionStorage.setItem('pv_admin_repo', r);
        }
        stat.textContent = '✅ Conectado. usuarios.json será criado no 1º cliente.';
        stat.className = 'status-msg ok';
        document.getElementById('status').textContent = `✅ ${r}`;
        await mostrarPainel();
        return;
      }
      throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json();
    sha = data.sha;
    const json_text = atob(data.content);
    dadosAtuais = JSON.parse(json_text);
    if (!dadosAtuais.users) dadosAtuais.users = [];
    token = t; repo = r;
    if (lembrar) {
      sessionStorage.setItem('pv_admin_token', t);
      sessionStorage.setItem('pv_admin_repo', r);
    }
    stat.textContent =
      `✅ Conectado. ${dadosAtuais.users.length} cliente(s) cadastrado(s).`;
    stat.className = 'status-msg ok';
    document.getElementById('status').textContent = `✅ ${r}`;
    await mostrarPainel();
  } catch (e) {
    stat.textContent = `❌ Erro: ${e.message}`;
    stat.className = 'status-msg err';
    console.error(e);
  }
}

function logout() {
  if (!confirm('Deslogar e limpar token desta sessão?')) return;
  sessionStorage.removeItem('pv_admin_token');
  sessionStorage.removeItem('pv_admin_repo');
  location.reload();
}

// ─── Painel principal ─────────────────────────────────────────
async function mostrarPainel() {
  document.getElementById('setup-token').classList.add('hidden');
  document.getElementById('painel').classList.remove('hidden');
  renderTabela();
}

function renderTabela() {
  const tbody = document.querySelector('#tabela-users tbody');
  tbody.innerHTML = '';
  document.getElementById('contador-users').textContent =
    dadosAtuais.users.length;

  if (dadosAtuais.users.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="6" style="text-align:center; color:#666; padding:32px;">
        Nenhum cliente cadastrado.<br>Clique "Novo Cliente" pra criar o primeiro.
      </td>`;
    tbody.appendChild(tr);
    return;
  }

  dadosAtuais.users.forEach((u) => {
    const tr = document.createElement('tr');
    const status = u.ativo === false
      ? '<span class="badge badge-off">Desativado</span>'
      : '<span class="badge badge-on">Ativo</span>';
    const hwid_text = u.hwid
      ? `<code>${u.hwid}</code>`
      : '<span class="badge badge-pending">Pendente</span>';
    const expira = u.expira_em || '<i>nunca</i>';
    tr.innerHTML = `
      <td><b>${u.email}</b></td>
      <td>${hwid_text}</td>
      <td>${status}</td>
      <td>${u.criado_em || '?'}</td>
      <td>${expira}</td>
      <td class="acoes">
        <button onclick="vincularHwid('${u.email}')" title="Vincular HWID">🔓</button>
        <button onclick="resetarHwid('${u.email}')" title="Resetar HWID">🔄</button>
        <button onclick="toggleAtivo('${u.email}')" title="Ativar/Desativar">⏸</button>
        <button onclick="resetarSenha('${u.email}')" title="Nova senha">🔑</button>
        <button onclick="editarExpiracao('${u.email}')" title="Expiração">📅</button>
        <button onclick="deletar('${u.email}')" title="Deletar">🗑</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function recarregar() {
  await conectar();
}

// ─── Persistencia GitHub ──────────────────────────────────────
async function salvar(commitMsg) {
  const json_text = JSON.stringify(dadosAtuais, null, 2);
  const b64 = btoa(unescape(encodeURIComponent(json_text)));
  const body = { message: commitMsg, content: b64, branch: branch };
  if (sha) body.sha = sha;

  const resp = await fetch(
    `https://api.github.com/repos/${repo}/contents/${usuariosFile}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`PUT ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  sha = data.content.sha;
  return data;
}

// ─── Geracao de senha ──────────────────────────────────────────
function gerarSenha() {
  // Caracteres seguros (sem ambiguidade: 0/O, 1/l/I)
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(16);
  crypto.getRandomValues(arr);
  let s = '';
  for (const v of arr) s += chars[v % chars.length];
  document.getElementById('novo-senha').value = s;
}

function copiarSenha() {
  const s = document.getElementById('novo-senha').value;
  if (!s) { alert('Gere uma senha primeiro'); return; }
  navigator.clipboard.writeText(s);
  alert(`Senha copiada: ${s}\n\n⚠ NÃO esqueça de SALVAR o usuário antes de fechar!`);
}

function abrirNovoUsuario() {
  document.getElementById('novo-email').value = '';
  document.getElementById('novo-senha').value = '';
  document.getElementById('novo-expira').value = '';
  document.getElementById('novo-status').textContent = '';
  document.getElementById('modal-novo').classList.remove('hidden');
  gerarSenha();   // já gera uma
}

async function criarUsuario() {
  const email = document.getElementById('novo-email').value.trim().toLowerCase();
  const senha = document.getElementById('novo-senha').value.trim();
  const expira = document.getElementById('novo-expira').value || null;
  const stat = document.getElementById('novo-status');

  if (!email || !senha) {
    stat.textContent = '⚠ Email e senha obrigatórios';
    stat.className = 'status-msg err';
    return;
  }
  if (dadosAtuais.users.find(u => u.email.toLowerCase() === email)) {
    stat.textContent = '❌ Email já cadastrado';
    stat.className = 'status-msg err';
    return;
  }

  stat.textContent = '⏳ Salvando...';
  const hash = await sha256(senha + SENHA_SALT);
  const novo = {
    email,
    password_hash: hash,
    hwid: null,
    ativo: true,
    criado_em: new Date().toISOString().split('T')[0],
    expira_em: expira,
  };
  dadosAtuais.users.push(novo);

  try {
    await salvar(`add: cliente ${email}`);
    stat.textContent = '✅ Criado!';
    stat.className = 'status-msg ok';
    setTimeout(() => {
      fecharModal('modal-novo');
      renderTabela();
      alert(
        `✅ Cliente criado!\n\nEnvie estes dados pro cliente:\n\n` +
        `Email: ${email}\nSenha: ${senha}\n\n` +
        `⚠ Esta é a ÚNICA vez que a senha aparece em texto puro.`
      );
    }, 700);
  } catch (e) {
    dadosAtuais.users.pop();
    stat.textContent = `❌ Erro salvando: ${e.message}`;
    stat.className = 'status-msg err';
  }
}

// ─── Vincular HWID ────────────────────────────────────────────
let _hwidEmailAtual = null;

function vincularHwid(email) {
  _hwidEmailAtual = email;
  const u = dadosAtuais.users.find(x => x.email === email);
  if (!u) { alert('Usuário não encontrado'); return; }
  document.getElementById('hwid-email').textContent = email;
  document.getElementById('novo-hwid').value = u.hwid || '';
  document.getElementById('hwid-status').textContent = '';
  document.getElementById('modal-hwid').classList.remove('hidden');
}

async function salvarHwid() {
  const hwid = document.getElementById('novo-hwid').value.trim().toUpperCase();
  const stat = document.getElementById('hwid-status');
  if (!hwid || hwid.length < 8) {
    stat.textContent = '⚠ HWID inválido (mínimo 8 chars)';
    stat.className = 'status-msg err';
    return;
  }
  const u = dadosAtuais.users.find(x => x.email === _hwidEmailAtual);
  if (!u) return;
  u.hwid = hwid;
  stat.textContent = '⏳ Salvando...';
  try {
    await salvar(`hwid: ${u.email} -> ${hwid}`);
    stat.textContent = '✅ HWID vinculado!';
    stat.className = 'status-msg ok';
    setTimeout(() => {
      fecharModal('modal-hwid');
      renderTabela();
    }, 700);
  } catch (e) {
    stat.textContent = `❌ ${e.message}`;
    stat.className = 'status-msg err';
  }
}

async function resetarHwid(email) {
  if (!confirm(`Resetar HWID de ${email}?\n\nIsso libera o cliente pra usar em outro PC.`)) return;
  const u = dadosAtuais.users.find(x => x.email === email);
  if (!u) return;
  u.hwid = null;
  await salvar(`reset hwid: ${email}`);
  renderTabela();
  alert(`✅ HWID de ${email} resetado.`);
}

async function toggleAtivo(email) {
  const u = dadosAtuais.users.find(x => x.email === email);
  if (!u) return;
  const novo = u.ativo === false ? true : false;
  if (!confirm(`${novo ? 'Ativar' : 'DESATIVAR'} ${email}?`)) return;
  u.ativo = novo;
  await salvar(`${novo ? 'enable' : 'disable'}: ${email}`);
  renderTabela();
}

async function resetarSenha(email) {
  if (!confirm(`Gerar NOVA senha pra ${email}?\nA senha anterior NÃO funcionará mais.`)) return;
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(16);
  crypto.getRandomValues(arr);
  let s = '';
  for (const v of arr) s += chars[v % chars.length];
  const u = dadosAtuais.users.find(x => x.email === email);
  if (!u) return;
  u.password_hash = await sha256(s + SENHA_SALT);
  await salvar(`reset password: ${email}`);
  renderTabela();
  alert(
    `✅ Nova senha gerada!\n\nEnvie pro cliente:\n\n` +
    `Email: ${email}\nSenha: ${s}`
  );
}

async function editarExpiracao(email) {
  const u = dadosAtuais.users.find(x => x.email === email);
  if (!u) return;
  const atual = u.expira_em || '(nunca)';
  const novo = prompt(
    `Editar expiração de ${email}\n\n` +
    `Expiração atual: ${atual}\n\n` +
    `Digite a nova data no formato YYYY-MM-DD\n` +
    `(ex: 2027-05-09)\n\n` +
    `Atalhos comuns:\n` +
    `  Teste 24h:  amanhã\n` +
    `  Teste 7d:   +7 dias\n` +
    `  Teste 30d:  +30 dias\n\n` +
    `Pra setar INDEFINIDO (nunca expira), deixe VAZIO.`,
    u.expira_em || ''
  );
  if (novo === null) return;

  const v = novo.trim();
  if (v === '') {
    if (!confirm(`Setar ${email} como INDEFINIDO (nunca expira)?`)) return;
    u.expira_em = null;
    await salvar(`expira indefinido: ${email}`);
    renderTabela();
    alert(`✅ ${email} agora NUNCA expira.`);
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    alert('Formato inválido. Use YYYY-MM-DD (ex: 2027-05-09)');
    return;
  }
  const d = new Date(v + 'T00:00:00');
  if (isNaN(d.getTime())) {
    alert('Data inválida.');
    return;
  }
  if (!confirm(`Setar expiração de ${email} para ${v}?`)) return;
  u.expira_em = v;
  await salvar(`expira ${v}: ${email}`);
  renderTabela();
  alert(`✅ Expiração de ${email} setada pra ${v}`);
}

async function deletar(email) {
  if (!confirm(`DELETAR ${email}?\n\nEsta ação é IRREVERSÍVEL.`)) return;
  if (!confirm(`Tem CERTEZA? Cliente perde acesso permanentemente.`)) return;
  dadosAtuais.users = dadosAtuais.users.filter(u => u.email !== email);
  await salvar(`del: ${email}`);
  renderTabela();
}

function fecharModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ─── GUARDA SENHA MESTRA ──────────────────────────────────────
async function guardaSenhaMestra() {
  if (sessionStorage.getItem('pv_admin_unlocked') === 'yes') return true;

  for (let tent = 1; tent <= 3; tent++) {
    const t = prompt(`🔒 Senha mestra do admin (${tent}/3):`);
    if (t === null) {
      document.body.innerHTML =
        '<div style="padding:40px;color:#fff;font-family:sans-serif;' +
        'background:#0f0f1a;height:100vh">' +
        '<h1 style="color:#f87171">🔒 Acesso negado</h1>' +
        '<p>Painel protegido por senha mestra.</p></div>';
      return false;
    }
    const h = await sha256(t);
    if (h === SENHA_MESTRA_HASH) {
      sessionStorage.setItem('pv_admin_unlocked', 'yes');
      return true;
    }
    if (tent < 3) {
      alert(`Senha incorreta. Tentativas restantes: ${3 - tent}`);
    }
  }
  document.body.innerHTML =
    '<div style="padding:40px;color:#fff;font-family:sans-serif;' +
    'background:#0f0f1a;height:100vh">' +
    '<h1 style="color:#f87171">🔒 Acesso bloqueado</h1>' +
    '<p>3 tentativas incorretas. Recarregue a página pra tentar.</p></div>';
  return false;
}

// ─── Auto-load se token salvo ─────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const ok = await guardaSenhaMestra();
  if (!ok) return;

  const t = sessionStorage.getItem('pv_admin_token');
  const r = sessionStorage.getItem('pv_admin_repo');
  if (t) {
    document.getElementById('token-input').value = t;
    document.getElementById('lembrar-token').checked = true;
  }
  if (r) document.getElementById('repo-input').value = r;
});
