/* B02 read-only app-marker diagnosis. This file has no write-capable request path. */
(() => {
  'use strict';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const BASE = 'https://www.googleapis.com/drive/v3/';
  const MIME = 'application/vnd.google-apps.folder';
  const ROLES = ['root', 'ready', 'ledger', 'archive'];
  const NAMES = {root:'B02-Codex-Production',ready:'READY',ledger:'LEDGER',archive:'ARCHIVE'};
  const marker = role => 'b02-codex-production-v1-' + role;
  const $ = id => document.getElementById(id);
  const show = value => { $('result').textContent = value; };
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{10,128}$/.test(value);
  let token = null;
  let busy = false;
  try {
    const saved = JSON.parse(localStorage.getItem('B02Picker_Nonsecret_Settings_v1') || 'null');
    if (typeof saved?.client === 'string') $('client').value = saved.client;
  } catch { /* optional nonsecret convenience setting */ }
  async function get(path, params, step) {
    if (!token) throw Error('OAuth 토큰이 없습니다.');
    const url = new URL(BASE + path);
    Object.entries(params).forEach(([key,value]) => url.searchParams.set(key,value));
    let response;
    try { response = await fetch(url, {method:'GET',headers:{Authorization:'Bearer '+token},cache:'no-store'}); }
    catch { throw Error(step+' / GET: 응답 없음. 원격 상태 미확인.'); }
    if (!response.ok) throw Error(step+' / GET: HTTP '+response.status+'. 원격 상태 미확인.');
    try { return await response.json(); }
    catch { throw Error(step+' / GET: 응답 형식 오류. 원격 상태 미확인.'); }
  }
  async function diagnose(expectedEmail) {
    const about = await get('about',{fields:'user(emailAddress)'},'계정 확인 about.get');
    if (typeof about?.user?.emailAddress !== 'string' ||
        about.user.emailAddress.toLowerCase() !== expectedEmail)
      throw Error('B02 Google 계정이 일치하지 않습니다.');
    const rows = {};
    for (const role of ROLES) {
      const q = "appProperties has { key='b02_provision_role' and value='"+marker(role)+"' } and trashed = false";
      const page = await get('files',{q,fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,parents,appProperties,trashed)',pageSize:'1000'},'앱 표식 조회 files.list ('+role+')');
      if (!Array.isArray(page?.files) || page.nextPageToken || page.incompleteSearch !== false && page.incompleteSearch !== undefined)
        throw Error(role+' 목록이 불완전합니다. 원격 상태 미확인.');
      if (page.files.length > 1) throw Error(role+' 앱 표식이 중복됩니다. 원격 상태 미확인.');
      rows[role] = page.files[0] || null;
    }
    if (!rows.root && ROLES.slice(1).some(role => rows[role]))
      throw Error('root 없이 하위 폴더 표식이 보입니다. 원격 상태 미확인.');
    const details = {};
    for (const role of ROLES) {
      if (!rows[role]) { details[role] = null; continue; }
      if (!validId(rows[role].id)) throw Error(role+' 목록의 ID가 올바르지 않습니다.');
      const item = await get('files/'+encodeURIComponent(rows[role].id),
        {fields:'id,name,mimeType,parents,appProperties,trashed'},'메타데이터 재조회 files.get ('+role+')');
      if (item?.id !== rows[role].id || item.name !== NAMES[role] || item.mimeType !== MIME ||
          item.trashed !== false || item.appProperties?.b02_provision_role !== marker(role) ||
          !Array.isArray(item.parents) || item.parents.length !== 1 || !validId(item.parents[0]) ||
          (role !== 'root' && item.parents[0] !== rows.root?.id))
        throw Error(role+' ID·부모·MIME·앱 표식이 일치하지 않습니다. 원격 상태 미확인.');
      details[role] = item;
    }
    const lines = ROLES.map(role => details[role] ?
      role+': 1건 / ID '+details[role].id+' / 부모 '+details[role].parents[0]+' / MIME '+details[role].mimeType :
      role+': 앱 표식 조회 0건');
    return '읽기 전용 진단 완료 (생성·삭제·이동 0회)\n'+lines.join('\n')+
      '\n0건은 미생성 확정이 아닙니다. 생성 또는 재시도 전 원격 상태를 별도로 확인하세요.';
  }
  $('diagnose').addEventListener('click', () => {
    if (busy) return;
    const client = $('client').value.trim();
    const email = $('email').value.trim().toLowerCase();
    if (!/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(client) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return show('OAuth 웹 클라이언트 ID와 B02 Google 이메일을 확인하세요.');
    busy = true; $('diagnose').disabled = true;
    try {
      google.accounts.oauth2.initTokenClient({client_id:client,scope:SCOPE,include_granted_scopes:false,
        callback:async response => {
          try {
            if (response.error || !response.access_token || response.scope?.trim() !== SCOPE ||
                !google.accounts.oauth2.hasGrantedAllScopes(response,SCOPE))
              throw Error('drive.file 단일 범위 인증에 실패했습니다.');
            token=response.access_token;
            show('계정과 네 앱 표식을 읽는 중입니다.');
            show(await diagnose(email));
          } catch (error) { show('중단: '+(error.message || '원격 상태 미확인')); }
          finally { token=null; busy=false; $('diagnose').disabled=false; }
        }}).requestAccessToken({prompt:'consent'});
    } catch { token=null;busy=false;$('diagnose').disabled=false;show('Google 인증 화면을 열지 못했습니다.'); }
  });
  if (location.protocol !== 'https:' || !window.isSecureContext) show('신뢰하는 HTTPS 주소에서만 실행하세요.');
  else {
    const timer=setInterval(() => {
      if (window.google?.accounts?.oauth2) {clearInterval(timer);$('diagnose').disabled=false;show('준비됨. 읽기 전용 앱 표식 조회만 실행합니다.');}
    },200);
    setTimeout(() => {if ($('diagnose').disabled) {clearInterval(timer);show('Google 인증 라이브러리를 불러오지 못했습니다.');}},15000);
  }
})();
