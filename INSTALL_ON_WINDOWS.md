# Windows 10에서 빌드하는 방법

현재 Claude Code 환경은 네트워크 제한으로 인해 npm install이 불가능합니다.
하지만 **모든 소스 코드가 완성**되어 있으니 로컬 PC에서 빌드하시면 됩니다!

## 🎯 빠른 시작 (Windows 10/11)

### 1단계: Node.js 설치 ⬇️

1. https://nodejs.org/ 방문
2. "LTS" 버전 다운로드 (v18 이상 권장)
3. 설치 프로그램 실행
4. 모든 옵션 기본값으로 설치

설치 확인:
```powershell
node --version
npm --version
```

### 2단계: 프로젝트 다운로드 📥

#### 방법 A: Git 사용 (권장)
```powershell
git clone https://github.com/Yoongisang/PDFTool.git
cd PDFTool
```

#### 방법 B: ZIP 다운로드
1. GitHub 저장소에서 "Code" → "Download ZIP"
2. 압축 해제
3. PowerShell에서 폴더로 이동

### 3단계: 의존성 설치 📦

```powershell
npm install
```

**예상 소요 시간**: 첫 실행 시 5-10분
- Electron 바이너리 다운로드 (~100MB)
- PDF.js, PDF-lib 설치

### 4단계: 테스트 실행 🧪

```powershell
npm start
```

앱이 실행되면:
- ✅ PDF 파일 열기
- ✅ 하이라이트 추가
- ✅ 메모 작성
- ✅ 책갈피 추가

테스트 완료!

### 5단계: Windows 빌드 🔨

```powershell
npm run build:win
```

**예상 소요 시간**: 1-2분

빌드 완료 후:
```
dist/
├── Study PDF Viewer Setup 1.0.0.exe    (약 150-200MB)
│   → NSIS 설치 프로그램
│   → 다른 PC에 배포 가능
│
└── win-unpacked/
    └── Study PDF Viewer.exe
        → Portable 버전
        → 설치 없이 바로 실행
```

## 🎉 완료!

`dist/` 폴더에서 빌드 결과물을 확인하세요.

### 설치 프로그램 사용
```powershell
.\dist\Study PDF Viewer Setup 1.0.0.exe
```

### Portable 버전 사용
```powershell
.\dist\win-unpacked\Study PDF Viewer.exe
```

## ⚠️ 문제 해결

### npm install 실패 시

**오류: EACCES 권한 에러**
```powershell
# PowerShell을 관리자 권한으로 실행
```

**오류: 네트워크 타임아웃**
```powershell
npm config set registry https://registry.npmmirror.com
npm install
```

**오류: Electron 다운로드 실패**
```powershell
# .npmrc 파일 확인
# electron_mirror가 설정되어 있는지 확인
```

### npm start 실패 시

**오류: electron command not found**
```powershell
# node_modules 삭제 후 재설치
rm -r node_modules
npm install
```

### npm run build:win 실패 시

**오류: 디스크 공간 부족**
- 최소 1GB 여유 공간 필요

**오류: 빌드 타임아웃**
```powershell
# package.json의 build.win 섹션에 추가
"compression": "store"  # 압축 비활성화로 빌드 속도 향상
```

## 📝 추가 정보

### 빌드 옵션 변경

`package.json`의 `build` 섹션 수정:

```json
{
  "build": {
    "win": {
      "target": "nsis",  // 또는 "portable", "zip"
      "icon": "assets/icon.ico"
    }
  }
}
```

### 코드 서명 (선택사항)

Windows Defender 경고를 피하려면 코드 서명 필요:
- 코드 서명 인증서 구매 (Sectigo, DigiCert 등)
- package.json에 서명 정보 추가

### 자동 업데이트 (선택사항)

- electron-updater 사용
- GitHub Releases 또는 S3 연동

## 🔗 참고 자료

- [Electron 문서](https://www.electronjs.org/docs)
- [electron-builder 문서](https://www.electron.build/)
- [PDF.js 문서](https://mozilla.github.io/pdf.js/)

## 💬 문의

문제가 발생하면 GitHub Issues에 등록해주세요!
