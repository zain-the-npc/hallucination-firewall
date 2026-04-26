import os
import glob

# Files to analyze
exts = ('.py', '.tsx', '.ts')
ignore = ('node_modules', '.next', 'venv', '.git')

def walk_dir(path):
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignore]
        for file in files:
            if file.endswith(exts):
                yield os.path.join(root, file)

with open('all_code.txt', 'w', encoding='utf-8') as f:
    for path in walk_dir(r"c:\Users\hp probook\Desktop\GithubKi\hallucination-firewall"):
        f.write(f"\n\n{'='*40}\nFILE: {path}\n{'='*40}\n")
        try:
            with open(path, 'r', encoding='utf-8') as src:
                f.write(src.read())
        except Exception as e:
            f.write(str(e))
