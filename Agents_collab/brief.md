상태: 운영 중
기준일: 2026-05-15

# MDViewer — 프로젝트 브리프

## 프로젝트 개요

Electron 기반 macOS 마크다운 뷰어/에디터. AI Agent Manager용으로 제작.
현재 버전: 1.3.9

주요 기능 — MD 미리보기·편집, 내장 터미널, 파일 탐색기, 다크모드, 탭, 즐겨찾기

---

## 기술 스택

- Electron 33
- Node.js (main process: src/main.js, preload: src/preload.js)
- 렌더러: src/renderer.js, src/styles.css
- 빌드: electron-builder
- 의존성: marked, highlight.js, node-pty, xterm, chokidar, dompurify

---

## 현재 빌드 타겟

macOS 전용 (arm64 + x64 DMG)

---

## Codex 첫 번째 작업

Windows 빌드 지원 추가 — package.json에 win 빌드 섹션 추가 및 빌드 스크립트 보강

---

## 파일 구조

src/main.js — Electron 메인 프로세스
src/renderer.js — 렌더러 프로세스
src/preload.js — preload 스크립트
src/index.html — 메인 윈도우
src/panel-window.html — 패널 분리창
src/styles.css — 스타일
assets/ — 아이콘 등 리소스
dist/ — 빌드 결과물
