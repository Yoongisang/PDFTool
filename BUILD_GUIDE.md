# Windows 10 빌드 가이드

## 준비사항

1. **Node.js 설치** (v18 이상 권장)
   - https://nodejs.org/ 에서 다운로드
   - LTS 버전 추천

2. **Git 설치** (선택사항)
   - https://git-scm.com/

## 빌드 단계

### 1. 프로젝트 다운로드

```bash
git clone <repository-url>
cd PDFTool
```

또는 ZIP 파일로 다운로드하여 압축 해제

### 2. 의존성 설치

```bash
npm install
```

이 과정에서 다음 패키지들이 설치됩니다:
- electron (27.x)
- electron-builder (24.6.4)
- pdfjs-dist (3.11.174)
- pdf-lib (1.17.1)

### 3. 개발 모드로 테스트

```bash
npm start
```

앱이 실행되면 다음을 테스트하세요:
- PDF 파일 열기
- 하이라이트 추가 (5가지 색상)
- 메모 추가
- 책갈피 추가
- 페이지 탐색
- 줌 인/아웃

### 4. Windows 10 실행 파일 빌드

```bash
npm run build:win
```

빌드가 완료되면 `dist` 폴더에 다음 파일들이 생성됩니다:

```
dist/
├── Study PDF Viewer Setup 1.0.0.exe    # 설치 프로그램 (NSIS)
├── Study PDF Viewer 1.0.0.exe          # 단일 실행 파일
└── win-unpacked/                        # 압축 해제된 앱
```

## 빌드 결과물

### 1. NSIS 설치 프로그램 (.exe)
- 파일: `Study PDF Viewer Setup 1.0.0.exe`
- 크기: 약 150-200MB
- 사용법: 더블클릭하여 설치
- 설치 위치: `C:\Program Files\Study PDF Viewer\`
- 시작 메뉴에 바로가기 생성

### 2. Portable 버전 (win-unpacked)
- 위치: `dist/win-unpacked/`
- 설치 불필요, 직접 실행 가능
- `Study PDF Viewer.exe` 실행

## 배포

### 설치 프로그램 배포
```
Study PDF Viewer Setup 1.0.0.exe
```
이 파일 하나만 배포하면 됩니다.

### Portable 배포
`win-unpacked` 폴더 전체를 ZIP으로 압축하여 배포

## 문제 해결

### 빌드 중 오류 발생 시

1. **node_modules 삭제 후 재설치**
```bash
rm -rf node_modules
npm install
```

2. **npm 캐시 정리**
```bash
npm cache clean --force
npm install
```

3. **관리자 권한으로 실행**
   - PowerShell을 관리자 권한으로 실행
   - 프로젝트 폴더로 이동 후 다시 빌드

### 빌드가 느린 경우
- 첫 빌드는 약 5-10분 소요 (Electron 다운로드)
- 이후 빌드는 1-2분 내외

## 디지털 서명 (선택사항)

Windows Defender SmartScreen 경고를 피하려면:

1. 코드 서명 인증서 구매
2. `package.json`에 서명 설정 추가:

```json
"build": {
  "win": {
    "certificateFile": "path/to/cert.pfx",
    "certificatePassword": "password",
    "signingHashAlgorithms": ["sha256"]
  }
}
```

## 앱 크기 최적화

기본 빌드 크기: 약 150-200MB

최적화 옵션을 적용하려면 `package.json`의 build 섹션에 추가:

```json
"build": {
  "compression": "maximum",
  "asar": true
}
```

## 자동 업데이트 (고급)

electron-updater를 사용하여 자동 업데이트 구현 가능
- GitHub Releases 연동
- S3 버킷 연동
- 커스텀 서버 연동

자세한 내용은 electron-builder 문서 참조:
https://www.electron.build/auto-update

## 참고 자료

- Electron 문서: https://www.electronjs.org/docs
- electron-builder 문서: https://www.electron.build/
- PDF.js 문서: https://mozilla.github.io/pdf.js/
