"""Check local HTML destinations and image paths without network access."""

from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.ids = set()
        self.references = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if tag == "a" and attrs.get("name"):
            self.ids.add(attrs["name"])
        for attr in ("src", "href"):
            if attrs.get(attr):
                self.references.append((self.getpos()[0], attrs[attr]))

    handle_startendtag = handle_starttag


def check():
    pages = {}
    sources = {}
    for path in sorted(ROOT.rglob("*.html")):
        if any(part.startswith(".") or part == "node_modules"
               for part in path.relative_to(ROOT).parts):
            continue
        sources[path] = path.read_text(encoding="utf-8")
        pages[path] = Page(sources[path])
    errors = []
    checked = 0
    for path, page in pages.items():
        references = list(page.references)
        # Include image paths in the site's JavaScript HTML templates.
        references.extend(
            (sources[path].count("\n", 0, match.start()) + 1, match[1])
            for match in re.finditer(r'''\bsrc\s*=\s*["']([^"']+)["']''', sources[path])
        )
        for line, reference in sorted(set(references)):
            url = urlsplit(reference)
            if url.scheme or url.netloc:
                continue
            checked += 1
            target = ((ROOT if url.path.startswith("/") else path.parent)
                      / unquote(url.path).lstrip("/")).resolve() if url.path else path
            label = f"{path.relative_to(ROOT)}:{line}: {reference}"
            if not target.is_relative_to(ROOT):
                errors.append(f"{label} — chemin hors du site")
                continue
            # Check exact spelling even on case-insensitive filesystems.
            current = ROOT
            exists = True
            for part in target.relative_to(ROOT).parts:
                if not current.is_dir() or part not in {p.name for p in current.iterdir()}:
                    exists = False
                    break
                current /= part
            if exists and target.is_dir():
                target /= "index.html"
            if not exists or not target.is_file():
                errors.append(f"{label} — fichier absent ou casse incorrecte")
            elif url.fragment and target.suffix.lower() == ".html":
                destination = pages.get(target)
                if destination is None:
                    destination = Page(target.read_text(encoding="utf-8"))
                if unquote(url.fragment) not in destination.ids:
                    errors.append(f"{label} — ancre absente")
    for error in errors:
        print(error, file=sys.stderr)
    print(f"{len(pages)} page(s), {checked} références locales, {len(errors)} erreur(s).")
    if not pages:
        print("Aucune page HTML trouvée.", file=sys.stderr)
    return 1 if errors or not pages else 0


if __name__ == "__main__":
    sys.exit(check())
