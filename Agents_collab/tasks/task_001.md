지시서 번호: task_001
작성일: 2026-05-15
작업 유형: package.json 수정

---

## 목표

MDViewer의 package.json에 Windows 빌드 지원을 추가한다.

---

## 수정 대상 파일

/Volumes/TAEHO9_02/5. Product/1. MDViewer/package.json

---

## 수행할 작업

1. scripts 섹션에 아래 항목 추가

```json
"build:win": "electron-builder --win"
```

2. build 섹션 안에 win 항목 추가

```json
"win": {
  "target": [
    {
      "target": "nsis",
      "arch": ["x64", "ia32"]
    }
  ],
  "icon": "assets/icon.ico"
},
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true
}
```

3. build.files 배열에 아직 없는 항목이 있으면 그대로 유지. 기존 항목은 삭제하지 않는다.

---

## 주의사항

- assets/icon.ico 파일은 현재 없다. 빌드 설정에만 경로를 명시하고, 파일 생성은 하지 않는다.
- 기존 mac 섹션, dmg 섹션은 건드리지 않는다.
- JSON 문법 오류 없이 저장한다.

---

## 결과물

수정된 package.json 전문을 Agents_collab/output/task_001_package.json 으로 저장한다.
원본 파일(package.json)은 직접 수정하지 않는다.
