# CodeIn Model Setup (Additive Catalog)

## Principles

- Keep existing default/local model behavior unchanged.
- Add new coding model options without replacing current defaults.
- Work offline-first after first model installation.

## Existing Default Catalog (verified in runtime)

- Qwen2.5 Coder 7B (Q4)
- Qwen2.5 Coder 1.5B (Q8)
- DeepSeek-R1 Distill Qwen 7B (Q4)

## Added Coding Model Options

- StarCoder2 7B Instruct (Q4)
- CodeLlama 7B Instruct (Q4)

## Download Sources

- Qwen 2.5 Coder GGUF: https://huggingface.co/models?search=Qwen2.5-Coder-GGUF
- StarCoder2 GGUF: https://huggingface.co/models?search=starcoder2%20gguf
- CodeLlama Instruct GGUF: https://huggingface.co/models?search=CodeLlama%20Instruct%20GGUF

## Reproducible Setup (PowerShell)

```powershell
cd "C:\Users\reetu\Desktop\Bharta Code\packages\agent"
npm install
npm test
```

## Runtime Notes

- Models are managed in `~/.codin/models` and registry at `~/.codin/models.json`.
- First coder/reasoner installed keeps default assignment behavior unless explicitly changed.
