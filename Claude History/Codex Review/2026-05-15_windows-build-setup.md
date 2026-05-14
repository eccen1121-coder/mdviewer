날짜: 2026-05-15
작업: Windows 빌드 설정 추가 (task_001)
결과: 이슈 없음

## 반영 내용

- scripts.build:win 추가 — electron-builder --win
- build.win 추가 — NSIS 인스톨러, x64 + ia32, icon: assets/icon.ico
- build.nsis 추가 — 설치 경로 변경 허용, 바탕화면/시작 메뉴 바로가기

## 검수

- Codex가 JSON 파싱 검증 완료 (node -e JSON.parse)
- 기존 mac, dmg, files 섹션 유지 확인
- Claude 검토 후 원본 package.json에 적용

## 남은 작업

- assets/icon.ico 파일 준비 필요 (Windows 빌드 실행 전)
- 실제 Windows 환경에서 node-pty 네이티브 빌드 검증 필요
