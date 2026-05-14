FRONTEND_UI

Scene (Match)
- idle: nessuna partita attiva, CTA per cercare una partita.
- matchmaking: ricerca avversario con animazione.
- match_found: transizione breve prima della partita.
- p1_choose_ph: P1 sceglie il pH con griglia 0-14.
- p1_answer_indicator: P1 risponde (Acido, Intermedio, Basico).
- p2_choose_indicator: P2 seleziona un indicatore e puo aprire Indovina pH.
- waiting: attesa turno dell'avversario.
- end: vittoria/sconfitta/pareggio con confetti.

Overlay priority (solo un overlay alla volta)
1) Avversario disconnesso con countdown.
2) Feedback errore (pH errato o risposta errata) con azione Riprova.
3) Modal Indovina pH (P2).
4) Toast non bloccanti per penalita e notifiche.

Dove modificare il tema
- Colori e gradienti: frontend/src/styles.css (:root).
- Font: --font-display e --font-body in frontend/src/styles.css.
- Bottoni: classi .btn, .btn-primary, .btn-secondary, .btn-danger in frontend/src/styles.css.

Come testare i flussi (due tab)
1) Apri due schede, imposta nickname diversi, poi Gioca ora.
2) P1 sceglie il pH, P2 chiede un indicatore, P1 risponde.
3) P2 usa Indovina pH e verifica penalita su errore.
4) Prova Arrenditi con punteggio 0.
5) Chiudi una scheda per vedere disconnessione e countdown.

Mappatura scene
- La logica di mapping stato->scene e in frontend/src/pages/Match.tsx (resolveScene).
