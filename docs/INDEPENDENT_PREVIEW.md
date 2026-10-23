# B02 Picker 독립 시험 배포 준비

상태: **준비 전용. 이 PR은 배포·Google 인증·Drive 조회를 실행하지 않는다.**

## 확인한 기존 Pages 설정 (2026-10-23)

공개 GitHub Pages 설정 API의 읽기 결과 `b02-picker-test`는 `built`, `build_type: legacy`, 소스 `main`의 `/`, `https_enforced: true`, URL `https://sonni0205-stack.github.io/b02-picker-test/`다. 이 저장소의 Pages 설정이나 main을 바꾸면 운영 사이트에 영향을 줄 수 있으므로 PR 브랜치를 이 저장소의 Pages 소스로 전환하지 않는다.

## 별도 URL 계획

별도의 공개 시험 저장소 `sonni0205-stack/b02-picker-test-preview`를 **추후 승인받은 뒤** 만들고, 시험 저장소의 Pages에서 아래 두 정적 파일만 배포한다.

`https://sonni0205-stack.github.io/b02-picker-test-preview/b02-standard-picker.html`

이는 운영 사이트와 경로·저장소가 다르지만 JavaScript **원본(origin)** 은 둘 다 `https://sonni0205-stack.github.io`다. 사용자가 확인한 기존 B02 OAuth 웹 클라이언트의 승인된 JavaScript 원본을 재사용할 수 있는 후보이며, 새 OAuth 리디렉션 URI는 이 브라우저 토큰 흐름에 필요하지 않다. 호스팅이 아직 만들어지지 않았으므로 시험 URL은 현재 접속할 수 없다.

GitHub Pages는 저장소별 프로젝트 경로를 쓰며 같은 사용자 도메인의 경로만 달라진다. 따라서 **브라우저 localStorage는 두 사이트에서 공유하는 원본 저장소**다. 시험 번들은 기존 페이지의 선택적 설정 저장 패널과 스크립트를 제거하고, 폴더 ID 입력칸을 마스킹한다. 운영 페이지에 과거 저장된 값은 시험 페이지가 읽거나 지우지 않는다. 브라우저 개발자 도구나 같은 원본의 다른 스크립트로부터 입력값을 숨기는 보안 경계는 아니므로 개인 기기에서만 시험한다.

## 배포 준비 명령

`node tools/prepare-independent-preview.cjs /tmp/b02-picker-preview-output`

명령은 저장소 밖 빈 디렉터리에 `b02-standard-picker.html`, `b02-standard-picker.js` 두 파일만 만든다. 원본 Picker JavaScript를 수정·축약하지 않는다. 실제 키·토큰·폴더 ID를 하드코딩한 입력값, 브라우저 저장소 사용, 쓰기 HTTP 메서드, 예상 외 스크립트 출처가 있으면 파일 작성 전에 중단한다. 생성된 두 파일의 내용을 검토하고 **승인된 후** 별도 저장소에 업로드한다. 현재 PR에는 그 저장소나 Pages 워크플로를 생성하지 않는다.

## 배포 전 계정 설정 확인 항목

1. 사용자 확인 사항: OAuth 웹 클라이언트의 승인된 JavaScript 원본에 `https://sonni0205-stack.github.io`가 등록됨. 별도 프로젝트 경로도 같은 원본을 사용한다.
2. **아직 계정에서 확인되지 않은 사항:** 기존 API 키의 웹사이트 제한이 새 경로와 `https://docs.google.com/*`를 허용하는지, API 제한에 Google Picker API가 포함되는지. 키가 기존 `/b02-picker-test/*` 경로에만 제한됐다면 새 경로는 실패할 수 있다. 이 경우 설정 변경 승인을 별도로 받으며 키를 코드·채팅·PR에 넣지 않는다.
3. 시험은 사용자가 갤럭시에서 Google 공식 인증을 통해 직접 수행한다. Picker 선택과 Drive GET은 사용자가 명시적으로 누른 뒤에만 진행한다. OAuth Refresh Token 및 GitHub Secrets는 변경하지 않는다.

## 현재 검증 한계

정적 번들과 모의 테스트는 Google Picker 동작, 키 제한, 실제 Galaxy 표시, 기존 GitHub Actions Refresh Token의 새 접근 권한을 증명하지 않는다. Pages URL 배포와 실제 로그인·Drive 읽기는 별도 승인·실기기 단계다. Drive 쓰기·자동 제작·게시 기능은 계속 OFF다. 새 저장소의 공개 Pages는 GitHub 무료 요금제에서 가능한 경로이지만, 현재 계정의 사용량·결제 상태를 배포 직전에 다시 확인한다.

근거: [GitHub Pages 프로젝트 사이트](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [Google Picker 웹 통합](https://developers.google.com/workspace/drive/picker/guides/web-picker), [Google Picker API 키 웹사이트 제한](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample).
