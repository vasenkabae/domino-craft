const { Auth } = require('msmc');

function makeAuth(azureClientId) {
  // Без своего Azure client id msmc использует встроенный.
  return azureClientId
    ? new Auth({ client_id: azureClientId, redirect: 'http://localhost' })
    : new Auth('select_account');
}

async function toSession(xbox) {
  const mc = await xbox.getMinecraft();
  return {
    mclc: mc.mclc(),
    profile: { name: mc.profile.name, uuid: mc.profile.id },
    refresh: xbox.save()
  };
}

// Открывает окно входа Microsoft (Electron) и возвращает данные сессии.
async function loginMicrosoft(azureClientId) {
  const xbox = await makeAuth(azureClientId).launch('electron');
  return toSession(xbox);
}

// Тихое продление сессии по сохранённому refresh-токену.
async function refreshMicrosoft(refreshToken, azureClientId) {
  const xbox = await makeAuth(azureClientId).refresh(refreshToken);
  return toSession(xbox);
}

module.exports = { loginMicrosoft, refreshMicrosoft };
