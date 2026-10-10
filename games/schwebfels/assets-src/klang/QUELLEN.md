# Quellen der Klangbank

Alle Aufnahmen sind gemeinfrei (CC0 1.0): frei nutzbar, auch kommerziell, ohne Namensnennung.
Wir nennen die Urheber trotzdem, aus Anstand und damit sich jede Datei zurückverfolgen lässt.
Sammlungen mit anderen Lizenzen (CC-BY, CC-BY-SA, GPL, OGA-BY) wurden bewusst nicht verwendet.
Bei Sammlungen mit mehreren Lizenzen zur Wahl (Battle Sound Effects, Spell Sounds) gilt die CC0-Wahl.

| Unterordner (Download) | Sammlung | Urheber | Seite |
|---|---|---|---|
| `kenney-rpg` | RPG Audio (50 Dateien) | Kenney | https://kenney.nl/assets/rpg-audio |
| `kenney-impact` | Impact Sounds (130 Dateien) | Kenney | https://kenney.nl/assets/impact-sounds |
| `oga-creature` | 80 CC0 creature SFX | rubberduck | https://opengameart.org/content/80-cc0-creature-sfx |
| `oga-rpg80` | 80 CC0 RPG SFX | rubberduck | https://opengameart.org/content/80-cc0-rpg-sfx |
| `oga-100` | 100 CC0 SFX | rubberduck | https://opengameart.org/content/100-cc0-sfx |
| `oga-sword` | 20 Sword Sound Effects (Attacks and Clashes) | StarNinjas | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes |
| `oga-swish` | Swishes Sound Pack | artisticdude | https://opengameart.org/content/swishes-sound-pack |
| `oga-weapons` | Fantasy Weapons and Apparel SFX Library | Vehicle | https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library |
| `oga-ghost` | Ghost Monster Voice Moaning & Growling | qubodup | https://opengameart.org/content/ghost-monster-voice-moaning-growling |
| `oga-ice` | Ice spells | bart | https://opengameart.org/content/ice-spells |
| `oga-freeze` | Freeze Spell | artisticdude | https://opengameart.org/content/freeze-spell-0 |
| `oga-femvoice` | Female RPG Voice Starter Pack | cicifyre | https://opengameart.org/content/female-rpg-voice-starter-pack |
| `oga-rpgpack` | RPG Sound Pack | artisticdude | https://opengameart.org/content/rpg-sound-pack |
| `oga-melee` | 3 Melee sounds | remaxim | https://opengameart.org/content/3-melee-sounds |
| `oga-battle` | Battle Sound Effects (CC0 gewählt) | artisticdude | https://opengameart.org/content/battle-sound-effects |
| `oga-magic` | Magic Spell SFX | JaggedStone | https://opengameart.org/content/magic-spell-sfx |
| `oga-spells` | Spell Sounds (CC0 gewählt) | Augmentality (Brandon Morris) | https://opengameart.org/content/spell-sounds |

Lizenzhinweis von Kenney: alle Spielinhalte auf den Kenney-Seiten sind CC0 (https://kenney.nl/support).
Bei OpenGameArt steht die Lizenz auf jeder Sammlungsseite unter „License(s)“.

Neu bauen: Sammlungen herunterladen und entpacken (Ordnernamen wie oben), dann

```sh
python3 assets-src/klang/build_klang.py <download-ordner> assets/klang.pack [<vorhoer-ordner>]
node build.mjs
```

Das Werkzeug braucht `ffmpeg` (mit libmp3lame) und numpy. Die Rohdateien gehören nicht ins Repository, nur das fertige
`assets/klang.pack` (MP3, einkanalig, 64 kbit/s, etwa 1,6 MB).
