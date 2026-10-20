# Asistent

Osobní asistent (úkoly, připomínky, kalendář, finance) jako webová aplikace na GitHub Pages.
Kód je v tomto **veřejném** repozitáři, data v **soukromém** repozitáři `asistent-data` (soubor `data.json`).
Vše běží zdarma jen na GitHubu.

## Jak to funguje
- Aplikace se otevírá z `https://<uživatel>.github.io/asistent/`, na iPhonu i Macu jde přidat na plochu / do Docku.
- Při každé změně uloží `data.json` do soukromého repozitáře přes GitHub API (fine-grained token jen k tomu jednomu repozitáři).
- Druhé zařízení si změny načte do minuty (a hned po otevření aplikace).
- Každé ráno vytvoří GitHub Actions v `asistent-data` issue „Dnes …“ s úkoly a platbami → notifikace v mobilní aplikaci GitHub.

## Rozšiřování
Nový modul = nová kolekce v `data.json` (`GHStore.db.collection('nazev')`) a nová část v `index.html`.
Historie všech změn dat je v historii commitů repozitáře `asistent-data`.
