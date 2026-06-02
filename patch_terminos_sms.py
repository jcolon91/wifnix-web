#!/usr/bin/env python3
# Inserta la subseccion 7.5 (Mensajes SMS) en terminos.html, en estetica Wifnix.
# GUARDA: no escribe nada si el ancla no aparece exactamente 1 vez, si ya existe 7.5,
# o si el bloque nuevo llego incompleto.
import base64, sys
TARGET = "/var/www/wifnix/frontend/terminos.html"
OLD = base64.b64decode("c3R5bGU9ImNvbG9yOnZhcigtLWJsdWUtbGlnaHQpIj5jdXN0b21lcnNlcnZpY2VAd2lmbml4LmNvbTwvYT4uPC9wPg==").decode("utf-8")
NEW = base64.b64decode("c3R5bGU9ImNvbG9yOnZhcigtLWJsdWUtbGlnaHQpIj5jdXN0b21lcnNlcnZpY2VAd2lmbml4LmNvbTwvYT4uPC9wPgogICAgPGgzPjcuNSBNZW5zYWplcyBkZSBUZXh0byAoU01TKTwvaDM+CiAgICA8cD5TaSBlbCBjbGllbnRlIHByb3ZlZSBzdSBuw7ptZXJvIGRlIHRlbMOpZm9ubyB5IG90b3JnYSBzdSBjb25zZW50aW1pZW50byAobWFyY2FuZG8gbGEgY2FzaWxsYSBjb3JyZXNwb25kaWVudGUgYWwgcmVnaXN0cmFyc2UpLCBXaWZuaXggTExDIGxlIGVudsOtYSBtZW5zYWplcyBkZSB0ZXh0byB0cmFuc2FjY2lvbmFsZXM6IGPDs2RpZ29zIGRlIHZlcmlmaWNhY2nDs24gZGUgYWNjZXNvICgyRkEpIHkgbm90aWZpY2FjaW9uZXMgc29icmUgY2l0YXMsIGVzdGFkbyBkZWwgdMOpY25pY28geSDDs3JkZW5lcy4gTGEgZnJlY3VlbmNpYSB2YXLDrWEgc2Vnw7puIGxhIGFjdGl2aWRhZCBkZSBsYSBjdWVudGEgeSA8c3Ryb25nIHN0eWxlPSJjb2xvcjp2YXIoLS13aGl0ZSkiPnB1ZWRlbiBhcGxpY2FyIHRhcmlmYXMgZGUgbWVuc2FqZXMgeSBkYXRvczwvc3Ryb25nPiBkZWwgb3BlcmFkb3IgZGVsIGNsaWVudGUuPC9wPgogICAgPHVsPgogICAgICA8bGk+UGFyYSBjYW5jZWxhciwgcmVzcG9uZGEgPHN0cm9uZyBzdHlsZT0iY29sb3I6dmFyKC0td2hpdGUpIj5TVE9QPC9zdHJvbmc+IGVuIGN1YWxxdWllciBtb21lbnRvPC9saT4KICAgICAgPGxpPlBhcmEgYXl1ZGEsIHJlc3BvbmRhIDxzdHJvbmcgc3R5bGU9ImNvbG9yOnZhcigtLXdoaXRlKSI+SEVMUDwvc3Ryb25nPiBvIGVzY3JpYmEgYSBjdXN0b21lcnNlcnZpY2VAd2lmbml4LmNvbTwvbGk+CiAgICAgIDxsaT5FbCBjb25zZW50aW1pZW50byBwYXJhIHJlY2liaXIgbWVuc2FqZXMgU01TIG5vIGVzIGNvbmRpY2nDs24gcGFyYSBjb21wcmFyPC9saT4KICAgIDwvdWw+CiAgICA8ZGl2IGNsYXNzPSJoaWdobGlnaHQiPgogICAgICA8cD48c3Ryb25nIHN0eWxlPSJjb2xvcjp2YXIoLS13aGl0ZSkiPk5vIHZlbmRlbW9zIG5pIGNvbXBhcnRpbW9zIGxhIGluZm9ybWFjacOzbiBkZWwgbsO6bWVybyBkZSB0ZWzDqWZvbm8gbcOzdmlsIGRlbCBjbGllbnRlLCBuaSBsb3MgZGF0b3MgZGUgY29uc2VudGltaWVudG8gZGUgU01TLCBjb24gdGVyY2Vyb3MgbmkgYWZpbGlhZG9zIHBhcmEgZmluZXMgZGUgbWVyY2FkZW8gbyBwcm9tb2Npw7NuLjwvc3Ryb25nPjwvcD4KICAgICAgPHAgc3R5bGU9Im1hcmdpbi10b3A6OHB4O2ZvbnQtc2l6ZTowLjc4cmVtO2NvbG9yOnZhcigtLWdyYXkyKSI+Tm8gbW9iaWxlIGluZm9ybWF0aW9uIHdpbGwgYmUgc2hhcmVkIHdpdGggdGhpcmQgcGFydGllcyBvciBhZmZpbGlhdGVzIGZvciBtYXJrZXRpbmcgb3IgcHJvbW90aW9uYWwgcHVycG9zZXMuIFRleHQgbWVzc2FnaW5nIG9yaWdpbmF0b3Igb3B0LWluIGRhdGEgYW5kIGNvbnNlbnQgd2lsbCBub3QgYmUgc2hhcmVkIHdpdGggYW55IHRoaXJkIHBhcnRpZXMuIE1lc3NhZ2UgYW5kIGRhdGEgcmF0ZXMgbWF5IGFwcGx5LiBSZXBseSBTVE9QIHRvIG9wdCBvdXQgYW5kIEhFTFAgZm9yIGhlbHAuPC9wPgogICAgPC9kaXY+").decode("utf-8")
with open(TARGET, encoding="utf-8") as f:
    s = f.read()
if "7.5 Mensajes de Texto" in s:
    print("ABORT: ya existe la seccion 7.5. No se escribio nada."); sys.exit(1)
n = s.count(OLD)
if n != 1:
    print("ABORT: ancla encontrada", n, "veces (esperaba 1). No se escribio nada."); sys.exit(1)
if not all(x in NEW for x in ("7.5 Mensajes de Texto", "STOP", "HELP", "tarifas de mensajes")):
    print("ABORT: el bloque NEW llego incompleto. No se escribio nada."); sys.exit(1)
with open(TARGET, "w", encoding="utf-8") as f:
    f.write(s.replace(OLD, NEW, 1))
print("OK: subseccion 7.5 (SMS) insertada en", TARGET)
