# Vendored fonts

`DejaVuSans.ttf` and `DejaVuSans-Bold.ttf` are part of the **DejaVu Fonts** project.

They are committed to this repository deliberately. PDF service reports are generated
with `pdf-lib`, and the 14 standard PDF fonts cannot represent `č ć ž š đ` — a report for
a Bosnian customer would come out corrupted. Embedding a Unicode font is the fix, and
vendoring it means report generation has no network dependency and no install step.

**Licence:** DejaVu Fonts Licence — a permissive, Bitstream Vera derived licence that
allows use, modification, embedding and redistribution, including commercially. Full
text: <https://dejavu-fonts.github.io/License.html>

Source: <https://dejavu-fonts.github.io/>
