지시서 번호: task_002
작성일: 2026-05-15
작업 유형: GitHub Actions 워크플로우 파일 생성

---

## 목표

Windows용 인스톨러(.exe)를 GitHub Actions로 자동 빌드하는 워크플로우를 만든다.
나중에 봐도 구조를 바로 파악할 수 있도록 파일명과 step 이름을 명확하게 작성한다.

---

## 생성할 파일

Agents_collab/output/github-workflows/build-windows-installer.yml

(실제 적용 시 .github/workflows/build-windows-installer.yml 로 이동 예정)

---

## 워크플로우 스펙

### 트리거 조건 (on)

1. 버전 태그 push 시 자동 실행
   - 태그 패턴: v* (예: v1.4.0, v2.0.0)
2. 수동 실행 (workflow_dispatch)
   - GitHub 사이트 Actions 탭에서 "Run workflow" 버튼으로 실행 가능

### 실행 환경

- runs-on: windows-latest

### Steps (이 순서대로, 이름 그대로 사용)

1. name: "저장소 체크아웃"
   - uses: actions/checkout@v4

2. name: "Node.js 설치 (v20)"
   - uses: actions/setup-node@v4
   - with: node-version: '20'

3. name: "의존성 설치 (npm install)"
   - run: npm install

4. name: "Windows 인스톨러 빌드"
   - run: npm run build:win

5. name: "빌드 결과물 업로드 (Artifacts)"
   - uses: actions/upload-artifact@v4
   - with:
     - name: MDViewer-Windows-Installer
     - path: dist/*.exe

6. name: "GitHub Releases에 업로드 (태그 push 시에만)"
   - uses: softprops/action-gh-release@v2
   - if: startsWith(github.ref, 'refs/tags/')
   - with:
     - files: dist/*.exe

---

## 파일 상단 주석 (워크플로우 파일 맨 위에 YAML 주석으로 추가)

아래 내용을 # 주석으로 파일 맨 위에 추가한다.

```
# MDViewer Windows 인스톨러 자동 빌드
#
# 실행 조건
#   1. 버전 태그 push 시 자동 (예: git tag v1.4.0 && git push origin v1.4.0)
#   2. GitHub Actions 탭 > 이 워크플로우 선택 > Run workflow 버튼으로 수동 실행
#
# 결과물
#   - 태그 push 시: GitHub Releases에 .exe 인스톨러 자동 업로드
#   - 수동 실행 시: Actions > 해당 실행 > Artifacts에서 다운로드
```

---

## 주의사항

- JSON, YAML 문법 오류 없이 저장한다.
- softprops/action-gh-release@v2 는 GITHUB_TOKEN 권한으로 동작하므로 별도 시크릿 설정 불필요하다. permissions 블록을 추가한다: contents: write
- node-pty는 windows-latest 러너에 Visual Studio Build Tools가 사전 설치되어 있어 별도 설치 불필요하다.

---

## 결과물 저장

Agents_collab/output/github-workflows/build-windows-installer.yml
