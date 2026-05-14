날짜: 2026-05-15
작업: GitHub Actions Windows 빌드 워크플로우 생성 (task_002)
결과: 이슈 없음

## 생성 파일

.github/workflows/build-windows-installer.yml

## 반영 내용

- 트리거: 버전 태그(v*) push 시 자동 + workflow_dispatch 수동 실행
- 실행 환경: windows-latest
- permissions: contents: write (Releases 업로드 권한)
- 태그 push 시에만 GitHub Releases에 .exe 업로드
- 수동 실행 시 Artifacts에서 다운로드 가능

## 남은 작업

- GitHub에 저장소 생성 및 코드 push
- assets/icon.ico 파일 준비 (빌드 실행 전 필수)
