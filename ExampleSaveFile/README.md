# Example Save Files

이 폴더는 이어하기(Continue) 테스트용 예시 세이브를 보관합니다.

## 구성

- `W49(DraftTest)/slot_A.json`
- `W49(DraftTest)/index.json`

## 사용 방법 (Windows PowerShell)

아래 명령을 그대로 실행하면 W49(DraftTest) 세이브가 실제 저장 경로로 복사됩니다.

```powershell
$saveRoot = "$env:APPDATA\\Electron\\saves"
New-Item -ItemType Directory -Force -Path $saveRoot | Out-Null
Copy-Item -Force ".\\ExampleSaveFile\\W49(DraftTest)\\slot_A.json" (Join-Path $saveRoot "slot_A.json")
Copy-Item -Force ".\\ExampleSaveFile\\W49(DraftTest)\\index.json" (Join-Path $saveRoot "index.json")
```

## 적용 확인

```powershell
Get-ChildItem "$env:APPDATA\\Electron\\saves" | Where-Object { $_.Name -in @("slot_A.json", "index.json") }
```

게임을 재실행한 뒤 `이어하기`가 활성화되는지 확인하세요.
