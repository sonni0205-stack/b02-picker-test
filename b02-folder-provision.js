/* One-time B02 folder provisioning. No token/secret/content persistence or logging. */
(() => {
  'use strict';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const BASE = 'https://www.googleapis.com/drive/v3/';
  const FOLDER = 'application/vnd.google-apps.folder';
  const ROLES = ['root', 'ready', 'ledger', 'archive'];
  const NAMES = {root:'B02-Codex-Production',ready:'READY',ledger:'LEDGER',archive:'ARCHIVE'};
  const marker = role => 'b02-codex-production-v1-' + role;
  const $ = id => document.getElementById(id);
  const status = text => { $('result').textContent = text; };
  const validId = value => /^[A-Za-z0-9_-]{10,128}$/.test(value);
  let token = null;
  let busy = false;
  let writeStarted = false;
  try {
    const saved = JSON.parse(localStorage.getItem('B02Picker_Nonsecret_Settings_v1') || 'null');
    if (saved && typeof saved === 'object') {
      if (typeof saved.client === 'string') $('client').value = saved.client;
      for (const role of ['root','ready','ledger'])
        if (typeof saved[role] === 'string') $('legacy-'+role).value = saved[role];
    }
  } catch { /* saved convenience fields are optional; no secrets are read */ }
  const inputs = () => {
    const client = $('client').value.trim();
    const email = $('email').value.trim().toLowerCase();
    const legacy = ['root','ready','ledger'].map(role => $('legacy-'+role).value.trim());
    if (!/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(client) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !legacy.every(validId) || new Set(legacy).size !== 3)
      throw Error('웹 클라이언트 ID·B02 Google 이메일·서로 다른 기존 폴더 ID 3개를 확인하세요.');
    return {client,email,legacy:new Set(legacy)};
  };
  async function api(path, {method='GET',params={},body,phase='사전검사',operation='Drive API'}={}) {
    if (!token) throw Error('B02 OAuth 토큰이 없습니다.');
    const url = new URL(BASE + path);
    Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
    const headers = {Authorization:'Bearer '+token};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try { response = await fetch(url, {method,headers,
      body:body === undefined ? undefined : JSON.stringify(body),cache:'no-store'}); }
    catch { throw Error(phase+' / '+method+' '+operation+': 응답 없음. 원격 상태 미확인.'); }
    if (!response.ok) throw Error(phase+' / '+method+' '+operation+': HTTP '+response.status+'. 원격 상태 미확인.');
    try { return await response.json(); }
    catch { throw Error(phase+' / '+method+' '+operation+': 응답 형식 오류. 원격 상태 미확인.'); }
  }
  async function find(role, phase='생성 전 표식 조회') {
    const q = "appProperties has { key='b02_provision_role' and value='"+marker(role)+"' } and trashed = false";
    const page = await api('files',{phase,operation:'files.list ('+role+')',params:{q,fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,parents,appProperties,trashed)',pageSize:'1000'}});
    if (!Array.isArray(page.files) || page.nextPageToken || page.incompleteSearch)
      throw Error('앱 생성 폴더 목록이 불완전합니다. 생성을 중단합니다.');
    return page.files;
  }
  async function meta(id,role) {
    if (!validId(id)) throw Error('원격 폴더 ID 형식이 올바르지 않습니다.');
    return api('files/'+encodeURIComponent(id),{phase:'생성 후 재조회',operation:'files.get ('+role+')',params:{fields:'id,name,mimeType,parents,appProperties,trashed'}});
  }
  function verify(info,role,parent,legacy) {
    if (!validId(info?.id) || legacy.has(info.id) || info.name !== NAMES[role] ||
        info.mimeType !== FOLDER || info.trashed !== false ||
        !Array.isArray(info.parents) || info.parents.length !== 1 ||
        (role === 'root' ? !validId(info.parents[0]) || legacy.has(info.parents[0]) : info.parents[0] !== parent) ||
        info.appProperties?.b02_provision_role !== marker(role))
      throw Error(role+' 폴더의 ID·부모·유형·앱 표식 재조회가 일치하지 않습니다.');
    return info.id;
  }
  async function provision(config) {
    const about = await api('about',{phase:'생성 전 계정 확인',operation:'about.get',params:{fields:'user(emailAddress)'}});
    if (typeof about.user?.emailAddress !== 'string' ||
        about.user.emailAddress.toLowerCase() !== config.email)
      throw Error('로그인한 Google 계정이 입력한 B02 Drive 계정과 다릅니다.');
    const found = {};
    for (const role of ROLES) {
      found[role] = await find(role);
      if (found[role].length > 1) throw Error(role+' 앱 표식이 중복되어 생성을 중단합니다.');
    }
    if (!found.root.length && ROLES.slice(1).some(role => found[role].length))
      throw Error('앱 root 없이 하위 폴더 표식이 있어 생성을 중단합니다.');
    const ids = {};
    for (const role of ROLES) {
      const parent = role === 'root' ? null : ids.root;
      if (found[role].length) {
        ids[role] = verify(await meta(found[role][0].id,role),role,parent,config.legacy);
      } else {
        writeStarted = true;
        const body = {name:NAMES[role],mimeType:FOLDER,
          appProperties:{b02_provision_role:marker(role)}};
        if (role !== 'root') body.parents = [parent];
        const created = await api('files',{phase:'생성 요청',operation:'files.create ('+role+')',method:'POST',params:{fields:'id'},body});
        ids[role] = verify(await meta(created.id,role),role,parent,config.legacy);
      }
    }
    for (const role of ROLES) {
      const items = await find(role,'생성 후 최종 표식 조회');
      if (items.length !== 1 || items[0].id !== ids[role])
        throw Error(role+' 최종 목록에서 정확히 1개가 확인되지 않았습니다.');
    }
    if (new Set(Object.values(ids)).size !== 4) throw Error('생성 폴더 ID가 중복됩니다.');
    return ids;
  }
  $('start').addEventListener('click', () => {
    if (busy) return;
    let config;
    try { config=inputs(); } catch(e) { return status('중단: '+e.message); }
    if (!confirm('B02 계정을 대조한 뒤 새 root·READY·LEDGER·ARCHIVE 폴더만 생성합니다. 계속할까요?')) return;
    busy=true; writeStarted=false; $('start').disabled=true;
    const client = google.accounts.oauth2.initTokenClient({
      client_id:config.client,scope:SCOPE,include_granted_scopes:false,
      callback:async response => {
        try {
          if (response.error || !response.access_token || response.scope?.trim() !== SCOPE ||
              !google.accounts.oauth2.hasGrantedAllScopes(response,SCOPE))
            throw Error('drive.file 단일 범위 인증에 실패했습니다.');
          token=response.access_token;
          status('B02 계정과 기존 앱 생성 표식을 확인 중입니다.');
          const ids=await provision(config);
          status('검증 완료: 동일 OAuth 앱으로 네 폴더의 ID·부모·유형·앱 표식을 재조회했습니다.\n'+
            'root: '+ids.root+'\nREADY: '+ids.ready+'\nLEDGER: '+ids.ledger+'\nARCHIVE: '+ids.archive+'\n'+
            '원고 업로드·기존 폴더 변경·Work 경로 변경은 수행하지 않았습니다.');
        } catch(e) { status('중단: '+(e.message||'원격 검증 실패')+'\n결과가 불명확하면 같은 버튼을 즉시 다시 누르지 마세요.'); }
        finally { token=null;busy=false;$('start').disabled=writeStarted; }
      }
    });
    try { client.requestAccessToken({prompt:'consent'}); }
    catch { token=null;busy=false;$('start').disabled=false;status('중단: Google 인증 화면을 열지 못했습니다.'); }
  });
  if (location.protocol !== 'https:' || !window.isSecureContext) status('중단: 신뢰하는 HTTPS 주소에서만 실행하세요.');
  else {
    const timer=setInterval(() => {
      if (window.google?.accounts?.oauth2) { clearInterval(timer);$('start').disabled=false;status('준비됨. 입력값은 이 탭에서만 사용됩니다.'); }
    },200);
    setTimeout(() => { if ($('start').disabled) { clearInterval(timer);status('중단: Google 인증 라이브러리를 불러오지 못했습니다.'); } },15000);
  }
})();
