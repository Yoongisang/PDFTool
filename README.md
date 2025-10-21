# Study PDF Viewer

공부에 최적화된 심플한 데스크톱 PDF 뷰어

## 주요 기능

- 📄 **PDF 뷰어**: 빠르고 부드러운 PDF 렌더링
- ✨ **하이라이트**: 5가지 색상의 하이라이트 지원
- 📝 **메모**: 하이라이트에 메모 추가 가능
- 🔖 **책갈피**: 여러 페이지 동시 책갈피 관리
- 🎨 **다크 테마**: 눈의 피로를 줄이는 다크 모드
- 💾 **자동 저장**: 모든 하이라이트/메모/책갈피 자동 저장
- 🔒 **완전 오프라인**: 인터넷 연결 불필요

## 시스템 요구사항

- Windows 10 이상
- macOS Monterey 이상
- Ubuntu 20.04 이상

## 설치 방법

### 개발 환경

1. 저장소 클론 또는 다운로드
```bash
git clone <repository-url>
cd PDFTool
```

2. 의존성 설치
```bash
npm install
```

3. 앱 실행
```bash
npm start
```

### 배포 버전 빌드

Windows:
```bash
npm run build:win
```

macOS:
```bash
npm run build:mac
```

Linux:
```bash
npm run build:linux
```

빌드된 파일은 `dist` 폴더에 생성됩니다.

## 사용 방법

### PDF 파일 열기
1. 앱 실행 후 "PDF 파일 열기" 버튼 클릭
2. 또는 PDF 파일을 드래그 앤 드롭
3. 또는 Ctrl+O (Cmd+O) 단축키 사용

### 하이라이트 추가
1. 툴바에서 "하이라이트" 버튼 클릭
2. 원하는 색상 선택
3. 마우스로 하이라이트할 영역 드래그
4. 메모 입력 (선택사항)

### 하이라이트 삭제
- 하이라이트를 우클릭하고 확인

### 책갈피 추가/제거
- 툴바의 ★ 버튼 클릭
- 또는 'B' 키 누르기

### 페이지 이동
- 이전/다음 버튼 사용
- 또는 방향키 (←, →) 사용
- 또는 페이지 번호 직접 입력
- 또는 사이드바의 썸네일 클릭

### 확대/축소
- +/- 버튼 사용
- 또는 Ctrl/Cmd + +/- 키

## 단축키

| 기능 | 단축키 |
|------|--------|
| PDF 열기 | Ctrl+O (Cmd+O) |
| 확대 | Ctrl++ (Cmd++) |
| 축소 | Ctrl+- (Cmd+-) |
| 이전 페이지 | ← |
| 다음 페이지 | → |
| 책갈피 토글 | B |
| 종료 | Ctrl+Q (Cmd+Q) |

## 데이터 저장 위치

### Windows
```
%APPDATA%/study-pdf-viewer/
├── highlights/
│   └── [pdf-filename].json
├── bookmarks/
│   └── [pdf-filename].json
└── settings.json
```

### macOS
```
~/Library/Application Support/study-pdf-viewer/
```

### Linux
```
~/.config/study-pdf-viewer/
```

## 기술 스택

- **Electron** 27.x - 크로스 플랫폼 데스크톱 앱 프레임워크
- **PDF.js** 3.11.174 - PDF 렌더링 라이브러리
- **PDF-lib** 1.17.1 - PDF 조작 라이브러리

## 프로젝트 구조

```
PDFTool/
├── package.json          # 프로젝트 설정
├── main.js              # Electron 메인 프로세스
├── index.html           # 랜딩 페이지
├── viewer.html          # PDF 뷰어 UI
├── viewer.js            # PDF 뷰어 로직
├── assets/              # 아이콘 및 리소스
├── build/               # 빌드 설정
└── dist/                # 빌드 결과물
```

## 라이선스

MIT

## 기여

이슈 및 풀 리퀘스트는 언제나 환영합니다!

## 문의

문제가 발생하거나 질문이 있으시면 이슈를 등록해주세요.