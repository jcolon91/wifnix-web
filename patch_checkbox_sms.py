#!/usr/bin/env python3
# Inserta un checkbox de consentimiento SMS (obligatorio, opt-in) en el registro
# del portal y de la app. GUARDA por archivo: salta si ya existe, aborta sin
# escribir si algun ancla no aparece exactamente 1 vez.
import sys, base64
def d(x): return base64.b64decode(x).decode("utf-8")
EDITS = [
  ("/var/www/wifnix/frontend/portal.html", [(d("PGJ1dHRvbiBjbGFzcz0iYnRuIiBpZD0icmVnLWJ0biIgb25jbGljaz0iZG9SZWdpc3RybygpIj5DcmVhciBjdWVudGEgZ3JhdGlzPC9idXR0b24+"), d("PGxhYmVsIHN0eWxlPSJkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6ZmxleC1zdGFydDtnYXA6OXB4O21hcmdpbjo0cHggMCAxNHB4O2N1cnNvcjpwb2ludGVyIj4KICAgICAgICA8aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJyZWctc21zLWNvbnNlbnQiIHN0eWxlPSJtYXJnaW4tdG9wOjNweDtmbGV4LXNocmluazowO3dpZHRoOjE2cHg7aGVpZ2h0OjE2cHg7YWNjZW50LWNvbG9yOnZhcigtLWJsKTtjdXJzb3I6cG9pbnRlciI+CiAgICAgICAgPHNwYW4gc3R5bGU9ImZvbnQtc2l6ZTowLjdyZW07Y29sb3I6dmFyKC0tZ3JheSk7bGluZS1oZWlnaHQ6MS41Ij5BY2VwdG8gcmVjaWJpciBtZW5zYWplcyBkZSB0ZXh0byAoU01TKSBkZSBXaWZuaXggTExDOiBjw7NkaWdvcyBkZSB2ZXJpZmljYWNpw7NuIHkgbm90aWZpY2FjaW9uZXMgZGUgY3VlbnRhIHkgc2VydmljaW8uIFB1ZWRlbiBhcGxpY2FyIHRhcmlmYXMgZGUgbWVuc2FqZXMgeSBkYXRvcy4gUmVzcG9uZGUgU1RPUCBwYXJhIGNhbmNlbGFyLiBWZXIgPGEgaHJlZj0iaHR0cHM6Ly93aWZuaXguY29tL3Rlcm1pbm9zLmh0bWwiIHRhcmdldD0iX2JsYW5rIiBzdHlsZT0iY29sb3I6dmFyKC0tYmwpIj5Uw6lybWlub3M8L2E+IHkgPGEgaHJlZj0iaHR0cHM6Ly93aWZuaXguY29tL3ByaXZhY2lkYWQuaHRtbCIgdGFyZ2V0PSJfYmxhbmsiIHN0eWxlPSJjb2xvcjp2YXIoLS1ibCkiPlByaXZhY2lkYWQ8L2E+Ljwvc3Bhbj4KICAgICAgPC9sYWJlbD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIiBpZD0icmVnLWJ0biIgb25jbGljaz0iZG9SZWdpc3RybygpIj5DcmVhciBjdWVudGEgZ3JhdGlzPC9idXR0b24+")), (d("ICBpZiAocGFzcy5sZW5ndGggPCA4KSB7IHNob3dBbGVydCgnTGEgY29udHJhc2XDsWEgZGViZSB0ZW5lciBhbCBtZW5vcyA4IGNhcmFjdGVyZXMnKTsgcmV0dXJuOyB9CiAgdmFyIGJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWctYnRuJyk7"), d("ICBpZiAocGFzcy5sZW5ndGggPCA4KSB7IHNob3dBbGVydCgnTGEgY29udHJhc2XDsWEgZGViZSB0ZW5lciBhbCBtZW5vcyA4IGNhcmFjdGVyZXMnKTsgcmV0dXJuOyB9CiAgaWYgKCFkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVnLXNtcy1jb25zZW50JykuY2hlY2tlZCkgeyBzaG93QWxlcnQoJ0RlYmVzIGFjZXB0YXIgcmVjaWJpciBtZW5zYWplcyBTTVMgcGFyYSBjcmVhciBsYSBjdWVudGEnKTsgcmV0dXJuOyB9CiAgdmFyIGJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWctYnRuJyk7"))]),
  ("/var/www/wifnix/app/index.html",        [(d("PGJ1dHRvbiBjbGFzcz0iYnRuLXByaW1hcnkiIGlkPSJyZWctYnRuIiBvbmNsaWNrPSJkb1JlZ2lzdHJvKCkiPkNyZWFyIGN1ZW50YSBncmF0aXM8L2J1dHRvbj4="), d("PGxhYmVsIHN0eWxlPSJkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6ZmxleC1zdGFydDtnYXA6OXB4O21hcmdpbjoycHggMCAxNHB4O2N1cnNvcjpwb2ludGVyIj4KICAgICAgICA8aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJyZWctc21zLWNvbnNlbnQiIHN0eWxlPSJtYXJnaW4tdG9wOjNweDtmbGV4LXNocmluazowO3dpZHRoOjE2cHg7aGVpZ2h0OjE2cHg7YWNjZW50LWNvbG9yOiMyOUI2RjY7Y3Vyc29yOnBvaW50ZXIiPgogICAgICAgIDxzcGFuIHN0eWxlPSJmb250LXNpemU6MC43NHJlbTtjb2xvcjp2YXIoLS1ncmF5KTtsaW5lLWhlaWdodDoxLjUiPkFjZXB0byByZWNpYmlyIG1lbnNhamVzIGRlIHRleHRvIChTTVMpIGRlIFdpZm5peCBMTEM6IGPDs2RpZ29zIGRlIHZlcmlmaWNhY2nDs24geSBub3RpZmljYWNpb25lcyBkZSBjdWVudGEgeSBzZXJ2aWNpby4gUHVlZGVuIGFwbGljYXIgdGFyaWZhcyBkZSBtZW5zYWplcyB5IGRhdG9zLiBSZXNwb25kZSBTVE9QIHBhcmEgY2FuY2VsYXIuIFZlciA8YSBocmVmPSJodHRwczovL3dpZm5peC5jb20vdGVybWlub3MuaHRtbCIgdGFyZ2V0PSJfYmxhbmsiIHN0eWxlPSJjb2xvcjp2YXIoLS1ibC1sKSI+VMOpcm1pbm9zPC9hPiB5IDxhIGhyZWY9Imh0dHBzOi8vd2lmbml4LmNvbS9wcml2YWNpZGFkLmh0bWwiIHRhcmdldD0iX2JsYW5rIiBzdHlsZT0iY29sb3I6dmFyKC0tYmwtbCkiPlByaXZhY2lkYWQ8L2E+Ljwvc3Bhbj4KICAgICAgPC9sYWJlbD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuLXByaW1hcnkiIGlkPSJyZWctYnRuIiBvbmNsaWNrPSJkb1JlZ2lzdHJvKCkiPkNyZWFyIGN1ZW50YSBncmF0aXM8L2J1dHRvbj4=")), (d("ICBpZiAoIXBhc3MgfHwgcGFzcy5sZW5ndGggPCA4KSB7IGVyci50ZXh0Q29udGVudCA9ICdMYSBjb250cmFzZcOxYSBkZWJlIHRlbmVyIGFsIG1lbm9zIDggY2FyYWN0ZXJlcyc7IGVyci5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTsgcmV0dXJuOyB9CiAgaWYgKCh0aXBvID09PSAnZW1wcmVzYV9zZXJ2aWNpb3MnIHx8IHRpcG8gPT09ICdlbXByZXNhX3JldmVuZGVkb3JhJykgJiYgIWVtcHJlc2EpIHsgZXJyLnRleHRDb250ZW50ID0gJ0luZ3Jlc2EgZWwgbm9tYnJlIGRlIGxhIGVtcHJlc2EnOyBlcnIuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7IHJldHVybjsgfQ=="), d("ICBpZiAoIXBhc3MgfHwgcGFzcy5sZW5ndGggPCA4KSB7IGVyci50ZXh0Q29udGVudCA9ICdMYSBjb250cmFzZcOxYSBkZWJlIHRlbmVyIGFsIG1lbm9zIDggY2FyYWN0ZXJlcyc7IGVyci5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTsgcmV0dXJuOyB9CiAgaWYgKCFkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVnLXNtcy1jb25zZW50JykuY2hlY2tlZCkgeyBlcnIudGV4dENvbnRlbnQgPSAnRGViZXMgYWNlcHRhciByZWNpYmlyIG1lbnNhamVzIFNNUyBwYXJhIGNyZWFyIGxhIGN1ZW50YSc7IGVyci5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTsgcmV0dXJuOyB9CiAgaWYgKCh0aXBvID09PSAnZW1wcmVzYV9zZXJ2aWNpb3MnIHx8IHRpcG8gPT09ICdlbXByZXNhX3JldmVuZGVkb3JhJykgJiYgIWVtcHJlc2EpIHsgZXJyLnRleHRDb250ZW50ID0gJ0luZ3Jlc2EgZWwgbm9tYnJlIGRlIGxhIGVtcHJlc2EnOyBlcnIuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7IHJldHVybjsgfQ=="))]),
]
total = 0
for path, reps in EDITS:
    try:
        s = open(path, encoding="utf-8").read()
    except FileNotFoundError:
        print("SKIP:", path, "(no existe)"); continue
    if "reg-sms-consent" in s:
        print("SKIP:", path, "(ya tiene el checkbox)"); continue
    bad = False
    for i,(old,new) in enumerate(reps):
        c = s.count(old)
        if c != 1:
            print("ABORT:", path, "- ancla", i+1, "encontrada", c, "veces (esperaba 1). Nada escrito en este archivo."); bad = True; break
    if bad: continue
    for old,new in reps:
        s = s.replace(old, new, 1)
    if s.count("reg-sms-consent") < 2:
        print("ABORT:", path, "- resultado inesperado, nada escrito."); continue
    open(path, "w", encoding="utf-8").write(s)
    print("OK:", path, "- checkbox + validacion insertados")
    total += 1
print("Archivos modificados:", total)
