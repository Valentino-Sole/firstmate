"""Klangbank des Spiels bauen: freie Aufnahmen (CC0, siehe QUELLEN.md) schneiden, in Tonhoehe anpassen, schichten,
angleichen und als MP3 in ein Paket packen (assets/klang.pack, gleiches Format wie schwebfels.pack).

Aufruf: python build_klang.py <download-ordner> <assets/klang.pack> [<vorhoer-ordner>]
  <download-ordner>: die entpackten Sammlungen aus QUELLEN.md, je Sammlung ein Unterordner mit dem dort genannten Namen
  <vorhoer-ordner>:  optional, legt jede fertige Variante als MP3 zum Anhoeren ab

Jeder Eintrag in BANK ist ein Klangname mit mehreren Varianten; das Spiel waehlt bei jedem Abspielen eine andere
und streut Tonhoehe und Lautstaerke leicht. Eine Variante besteht aus Schichten (Datei, Ausschnitt, Tonhoehe,
Lautstaerke, Versatz). Ohne Ausschnitt wird der hoerbare Teil der Datei genommen.
"""
import json
import os
import struct
import subprocess
import sys
import numpy as np

SR = 44100
ROOT = sys.argv[1]
OUT = sys.argv[2]
PREV = sys.argv[3] if len(sys.argv) > 3 else None

# Kurznamen der Sammlungen (Unterordner im Download-Ordner)
Q = {
    "RPG": "kenney-rpg/Audio/",
    "IMP": "kenney-impact/Audio/",
    "CRE": "oga-creature/",
    "R80": "oga-rpg80/",
    "SWA": "oga-sword/sword - StarNinjas/",
    "SWC": "oga-sword/",
    "SWI": "oga-swish/swishes/",
    "WEA": "oga-weapons/sfx/",
    "GHO": "oga-ghost/qubodup-GhostMoans/wav/",
    "ICE": "oga-ice/",
    "FRZ": "oga-freeze/",
    "FEM": "oga-femvoice/RPG Voice Starter Pack/",
    "RPP": "oga-rpgpack/RPG Sound Pack/",
    "MEL": "oga-melee/melee sounds/",
    "BAT": "oga-battle/battle_sound_effects/",
    "MAG": "oga-magic/",
    "SPL": "oga-spells/",
    "C100": "oga-100/",
}


def L(f, s=None, e=None, p=1.0, g=0.0, d=0.0):
    """Schicht: Datei (Kurzname:Pfad), Ausschnitt s bis e in Sekunden, Tonhoehe p, Lautstaerke g in dB, Versatz d."""
    q, path = f.split(":", 1)
    return dict(f=Q[q] + path, s=s, e=e, p=p, g=g, d=d)


def V(*layers, fade=0.04, maxlen=None):
    return dict(layers=list(layers), fade=fade, maxlen=maxlen)


def each(fn, items):
    return [fn(x) for x in items]


def fem(t, kind, n):
    return V(L("FEM:Type %d/%s%d.wav" % (t, kind, n)))


BANK = {
    # ---------- Schwung je Waffenart ----------
    "schwung.leicht": [V(L("SWI:swish-%d.wav" % i, p=1.15)) for i in (1, 2, 3, 4)] + [V(L("RPP:battle/swing2.wav")), V(L("RPP:battle/swing3.wav"))],
    "schwung.klinge": [V(L("SWA:sword.%d.ogg" % i)) for i in (3, 4, 6, 1)],
    "schwung.schwer": [V(L("SWI:swish-%d.wav" % i, p=0.72)) for i in (5, 6, 7, 8)] + [V(L("BAT:swish_3.wav", p=0.75)), V(L("RPP:battle/swing.wav", p=0.7))],
    "schwung.stoss": [V(L("SWI:swish-%d.wav" % i, p=1.25, e=None)) for i in (9, 10)] + [V(L("BAT:swish_2.wav")), V(L("BAT:swish_4.wav", p=1.1))],
    "schwung.klaue": [V(L("SWI:swish-%d.wav" % i, p=0.9)) for i in (11, 12, 13)] + [V(L("MEL:animal melee sound.wav"))],
    "ausweichen": [V(L("SWI:swish-%d.wav" % i, p=1.35, g=-3)) for i in (2, 4, 9)] + [V(L("RPG:cloth%d.ogg" % 2), L("SWI:swish-1.wav", p=1.4, g=-4))],
    # ---------- Was die Waffe beim Treffen tut ----------
    "schlag.klinge": [V(L("RPG:knifeSlice.ogg")), V(L("RPG:knifeSlice2.ogg")), V(L("R80:blade_01.ogg")), V(L("R80:blade_02.ogg")), V(L("R80:blade_03.ogg"))],
    "schlag.axt": [V(L("RPG:chop.ogg", p=0.85), L("IMP:impactWood_heavy_00%d.ogg" % i, g=-6, p=0.8)) for i in (0, 2, 4)] + [V(L("RPG:chop.ogg", p=1.0), L("IMP:impactPunch_heavy_001.ogg", g=-3))],
    "schlag.wucht": [V(L("IMP:impactPunch_heavy_00%d.ogg" % i)) for i in range(5)],
    "schlag.faust": [V(L("IMP:impactPunch_medium_00%d.ogg" % i)) for i in range(5)],
    "schlag.spitze": [V(L("IMP:impactSoft_medium_00%d.ogg" % i), L("RPG:knifeSlice.ogg", s=0.06, e=0.2, p=1.3, g=-8)) for i in (0, 1, 2)],
    "schlag.biss": [V(L("RPP:NPC/beetle/bite-small%s.wav" % n, p=0.8)) for n in ("", "2", "3")] + [V(L("MEL:animal melee sound.wav", p=0.9))],
    "schlag.zange": [V(L("IMP:impactPlate_light_00%d.ogg" % i, p=1.5), L("IMP:impactPlate_light_00%d.ogg" % ((i + 2) % 5), p=1.6, d=0.07, g=-3)) for i in (0, 1, 3)],
    "schlag.geist": [V(L("SWI:swish-%d.wav" % i, p=0.6, g=-2), L("MAG:magical_6.ogg", e=0.5, p=0.6, g=-6)) for i in (3, 7, 12)],
    # ---------- Was getroffen wird ----------
    "mat.metall": [V(L("IMP:impactPlate_medium_00%d.ogg" % i), L("WEA:sword-knife-clash-0%d.wav" % (i + 1), e=0.45, g=-12)) for i in range(5)],
    "mat.leder": [V(L("IMP:impactSoft_medium_00%d.ogg" % i)) for i in range(5)],
    "mat.fleisch": [V(L("IMP:impactPunch_medium_00%d.ogg" % i), L("IMP:impactSoft_heavy_00%d.ogg" % i, g=-5)) for i in range(4)],
    "mat.fell": [V(L("IMP:impactSoft_heavy_00%d.ogg" % i)) for i in range(5)],
    "mat.stein": [V(L("IMP:impactMining_00%d.ogg" % i)) for i in range(5)],
    "mat.holz": [V(L("IMP:impactWood_medium_00%d.ogg" % i)) for i in range(3)] + [V(L("IMP:impactWood_heavy_00%d.ogg" % i)) for i in (1, 3)],
    "mat.knochen": [V(L("IMP:impactWood_light_00%d.ogg" % i, p=1.3), L("IMP:impactPlank_medium_00%d.ogg" % i, p=1.2, g=-4, d=0.02)) for i in range(4)],
    "mat.panzer": [V(L("IMP:impactGeneric_light_00%d.ogg" % i, p=0.9), L("IMP:impactTin_medium_00%d.ogg" % i, g=-6)) for i in range(4)],
    "mat.schleim": [V(L("R80:creature_slime_0%d.ogg" % i)) for i in (1, 2, 3, 4)] + [V(L("C100:splash_01.ogg", g=-2)), V(L("C100:splash_02.ogg", g=-2))],
    "mat.geist": [V(L("MAG:magical_%d.ogg" % i, e=0.45, p=0.5)) for i in (6, 7, 2)],
    "mat.schuppen": [V(L("IMP:impactPlate_light_00%d.ogg" % i, p=0.8), L("IMP:impactSoft_heavy_00%d.ogg" % i, g=-3)) for i in range(4)],
    "mat.stoff": [V(L("IMP:impactSoft_medium_00%d.ogg" % i, p=1.1), L("RPG:cloth%d.ogg" % (i + 1), g=-6)) for i in range(4)],
    # ---------- Abwehr und kritische Treffer ----------
    "block.schild": [V(L("IMP:impactWood_heavy_00%d.ogg" % i), L("IMP:impactMetal_medium_00%d.ogg" % i, g=-5)) for i in range(4)],
    "block.waffe": [V(L("SWC:sword_clash.%d.ogg" % i), maxlen=0.7, fade=0.25) for i in (2, 4, 5, 8, 10)],
    "block.metall": [V(L("IMP:impactPlate_heavy_00%d.ogg" % i)) for i in range(5)],
    "krit": [V(L("IMP:impactPunch_heavy_00%d.ogg" % i, p=0.85), L("IMP:impactBell_heavy_00%d.ogg" % i, p=0.7, g=-12)) for i in (0, 2, 4)],
    # ---------- Fernkampf ----------
    "bogen.schuss": [V(L("BAT:Bow.wav", p=p), L("WEA:arrow-feathers-03.wav", g=-6, d=0.05)) for p in (1.0, 0.94, 1.06)],
    "armbrust.schuss": [V(L("RPG:metalLatch.ogg"), L("BAT:Bow.wav", p=0.8, d=0.03)), V(L("RPG:metalLatch.ogg", p=0.9), L("BAT:Bow.wav", p=0.75, d=0.04))],
    "pfeil.flug": [V(L("WEA:arrow-feathers-01.wav")), V(L("WEA:arrow-feathers-02.wav", s=0.1, e=0.6)), V(L("WEA:arrow-feathers-03.wav"))],
    "wurf": [V(L("SWI:swish-13.wav", p=1.2)), V(L("SWI:swish-10.wav", p=1.15))],
    # ---------- Magie je Schule: Wirken und Einschlag ----------
    "magie.frost.wirken": [V(L("ICE:ice.wav", e=0.6)), V(L("ICE:coldsnap.wav", e=0.5)), V(L("FRZ:freeze.wav", s=0.1, e=0.9))],
    "magie.frost.treffer": [V(L("IMP:impactGlass_medium_00%d.ogg" % i), L("ICE:coldsnap.wav", e=0.35, g=-6)) for i in range(4)],
    "magie.licht.wirken": [V(L("MAG:magical_%d.ogg" % i, e=0.9)) for i in (1, 3, 4)],
    "magie.licht.treffer": [V(L("MAG:magical_5.ogg", e=0.6), L("IMP:impactBell_heavy_001.ogg", p=1.5, g=-10)), V(L("MAG:magical_7.ogg", e=0.6), L("IMP:impactBell_heavy_003.ogg", p=1.6, g=-10))],
    "magie.runen.wirken": [V(L("RPP:battle/spell.wav", e=1.1)), V(L("RPP:battle/spell.wav", s=0.3, e=1.3, p=1.1))],
    "magie.dorn.wirken": [V(L("RPG:creak2.ogg", p=1.2), L("MAG:magical_2.ogg", e=0.8, p=0.8, g=-4)), V(L("RPG:creak1.ogg", p=1.1), L("MAG:magical_2.ogg", s=0.3, e=1.0, p=0.75, g=-4))],
    "magie.dorn.treffer": [V(L("IMP:impactWood_heavy_00%d.ogg" % i), L("R80:item_wood_0%d.ogg" % (i % 3 + 1), g=-4), L("RPG:creak3.ogg", p=1.3, g=-8)) for i in (0, 2, 4)],
    "magie.dunkel.wirken": [V(L("RPP:NPC/shade/shade%d.wav" % i, p=0.85), L("MAG:magical_2.ogg", e=0.7, p=0.6, g=-6)) for i in (1, 3, 5)],
    "magie.dunkel.treffer": [V(L("IMP:impactSoft_heavy_00%d.ogg" % i, p=0.7), L("GHO:qubodup-GhostMoan05.wav", s=0.15, e=0.8, p=0.8, g=-8)) for i in (0, 2)],
    "magie.feuer.wirken": [V(L("R80:spell_fire_0%d.ogg" % i)) for i in (1, 2, 6)],
    "magie.feuer.treffer": [V(L("R80:spell_fire_07.ogg"), L("C100:explosion.ogg", g=-4)), V(L("R80:spell_fire_05.ogg", e=0.7), L("IMP:impactSoft_heavy_002.ogg", g=-4))],
    "magie.blitz.wirken": [V(L("SPL:electricspell.ogg", s=s, e=s + 1.1)) for s in (0.45, 7.55, 11.15)],
    "magie.blitz.treffer": [V(L("SPL:electricspell2.ogg", s=s, e=s + 0.7), L("C100:slam_05.ogg", g=-6)) for s in (3.35, 9.3)],
    "magie.gift.wirken": [V(L("R80:creature_slime_02.ogg", p=1.2), L("CRE:burble_01.ogg", e=0.5, g=-4)), V(L("R80:creature_slime_04.ogg", p=1.1), L("CRE:burble_02.ogg", e=0.5, g=-4))],
    "magie.gift.treffer": [V(L("C100:splash_01.ogg", e=0.5), L("CRE:bug_02.ogg", p=0.8, g=-8)), V(L("R80:creature_slime_03.ogg"), L("CRE:bug_01.ogg", p=0.8, g=-8))],
    "magie.heilung": [V(L("SPL:healing.ogg", s=s, e=s + 1.3)) for s in (11.65, 14.55, 20.0)],
    "magie.teleport": [V(L("SPL:teleport.ogg", s=0.85, e=2.1)), V(L("SPL:teleport.ogg", s=2.85, e=4.5))],
    "magie.barriere": [V(L("MAG:magical_4.ogg", e=1.3, p=0.8)), V(L("MAG:magical_1.ogg", e=1.2, p=0.85))],
    "magie.reinigung": [V(L("C100:bell_03.ogg"), L("MAG:magical_5.ogg", e=1.0, g=-6))],
    # ---------- Stimmen der Gegner: Angriff, Schmerz, Tod, Auftritt ----------
    "stimme.wolf.angriff": [V(L("CRE:barking_01.ogg", p=0.85)), V(L("CRE:barking_02.ogg", p=0.8)), V(L("RPP:NPC/misc/wolfman.wav", p=0.9)), V(L("RPP:NPC/gutteral beast/mnstr2.wav", p=0.9))],
    "stimme.wolf.schmerz": [V(L("CRE:hurt_03.ogg", p=1.1)), V(L("CRE:hurt_02.ogg", p=1.0))],
    "stimme.wolf.tod": [V(L("CRE:howl.ogg", p=0.85), fade=0.3)],
    "stimme.wolf.auftritt": [V(L("CRE:howl.ogg", p=0.95), L("CRE:howl.ogg", p=0.88, d=0.45, g=-4), fade=0.3)],
    "stimme.drache.angriff": [V(L("R80:creature_roar_01.ogg", p=0.8)), V(L("R80:creature_roar_02.ogg", p=0.75)), V(L("CRE:roar_02.ogg", p=0.7))],
    "stimme.drache.schmerz": [V(L("R80:creature_roar_03.ogg", p=0.85)), V(L("CRE:roar_01.ogg", p=0.7))],
    "stimme.drache.tod": [V(L("R80:creature_die_01.ogg", p=0.7), fade=0.4)],
    # grosses Gebruell beim Auftritt: zwei Brueller nacheinander, darunter ein tiefes Grollen
    "stimme.drache.auftritt": [V(L("R80:creature_roar_02.ogg", p=0.62), L("CRE:roar_02.ogg", p=0.55, d=0.05, g=-3), L("R80:creature_roar_01.ogg", p=0.6, d=0.75),
                                 L("R80:creature_die_01.ogg", p=0.55, d=0.9, g=-6), fade=0.6)],
    "stimme.troll.angriff": [V(L("CRE:troll_0%d.ogg" % i, p=0.92)) for i in (1, 2, 3)] + [V(L("RPP:NPC/giant/giant%d.wav" % i)) for i in (1, 4)],
    "stimme.troll.schmerz": [V(L("RPP:NPC/ogre/ogre%d.wav" % i, p=0.85)) for i in (1, 3, 5)],
    "stimme.troll.tod": [V(L("RPP:NPC/giant/giant2.wav", p=0.8), fade=0.3)],
    "stimme.troll.auftritt": [V(L("RPP:NPC/giant/giant2.wav", p=0.9), L("CRE:troll_02.ogg", p=0.85, d=0.2, g=-4))],
    "stimme.golem.angriff": [V(L("CRE:monster_07.ogg", p=0.55), L("R80:stones_01.ogg", g=-4)), V(L("CRE:monster_04.ogg", p=0.6), L("R80:stones_03.ogg", g=-4))],
    "stimme.golem.schmerz": [V(L("R80:item_stone_0%d.ogg" % i, p=0.8), L("IMP:impactMining_00%d.ogg" % i, g=-6)) for i in (1, 2, 3)],
    "stimme.golem.tod": [V(L("R80:stones_02.ogg"), L("R80:stones_04.ogg", d=0.25), L("CRE:monster_07.ogg", p=0.5, g=-4), fade=0.4)],
    "stimme.golem.auftritt": [V(L("CRE:monster_04.ogg", p=0.5), L("R80:stones_01.ogg", d=0.1, g=-5), fade=0.4)],
    "stimme.schemen.angriff": [V(L("RPP:NPC/shade/shade%d.wav" % i)) for i in (2, 3, 4, 6)],
    "stimme.schemen.schmerz": [V(L("RPP:NPC/shade/shade%d.wav" % i, p=1.15)) for i in (8, 9, 11)],
    "stimme.schemen.tod": [V(L("GHO:qubodup-GhostMoan01.wav", e=2.0), fade=0.6)],
    "stimme.schemen.auftritt": [V(L("GHO:qubodup-GhostMoan05.wav"), fade=0.4), V(L("GHO:qubodup-GhostMoan03.wav", e=1.8), fade=0.5)],
    "stimme.ghul.angriff": [V(L("RPP:NPC/gutteral beast/mnstr%d.wav" % i)) for i in (1, 5, 9, 11)],
    "stimme.ghul.schmerz": [V(L("R80:creature_hurt_02.ogg")), V(L("RPP:NPC/gutteral beast/mnstr15.wav"))],
    "stimme.ghul.tod": [V(L("R80:creature_hurt_01.ogg", p=0.8), L("IMP:impactWood_light_002.ogg", p=1.3, d=0.35, g=-4), L("IMP:impactWood_light_004.ogg", p=1.2, d=0.5, g=-6))],
    "stimme.ghul.auftritt": [V(L("RPP:NPC/gutteral beast/mnstr14.wav"))],
    "stimme.spinne.angriff": [V(L("CRE:bug_0%d.ogg" % i)) for i in (1, 2, 4)] + [V(L("RPP:NPC/beetle/bite-small3.wav", p=0.9))],
    "stimme.spinne.schmerz": [V(L("CRE:bug_03.ogg", p=1.2)), V(L("CRE:bug_01.ogg", p=1.25))],
    "stimme.spinne.tod": [V(L("CRE:bug_02.ogg", p=0.8), L("R80:creature_slime_03.ogg", d=0.15, g=-4))],
    "stimme.spinne.auftritt": [V(L("CRE:bug_02.ogg", p=0.9), L("CRE:bug_04.ogg", d=0.25, g=-3))],
    "stimme.pilz.angriff": [V(L("CRE:burble_01.ogg", e=0.5), L("C100:plop_01.ogg", g=-2)), V(L("R80:creature_slime_02.ogg"), L("C100:plop_02.ogg", g=-2))],
    "stimme.pilz.schmerz": [V(L("R80:creature_slime_01.ogg", p=1.2)), V(L("R80:creature_slime_03.ogg", p=1.15))],
    "stimme.pilz.tod": [V(L("CRE:burble_02.ogg", p=0.8), L("C100:splash_02.ogg", d=0.2, g=-5))],
    "stimme.pilz.auftritt": [V(L("CRE:burble_01.ogg", p=0.9))],
    "stimme.baum.angriff": [V(L("RPG:creak1.ogg", p=0.7), L("R80:wood_02.ogg", g=-4)), V(L("RPG:creak2.ogg", p=0.65), L("R80:wood_04.ogg", g=-4))],
    "stimme.baum.schmerz": [V(L("R80:wood_03.ogg"), L("RPG:creak3.ogg", p=0.8, g=-3)), V(L("R80:wood_05.ogg"), L("RPG:creak3.ogg", p=0.7, g=-3))],
    "stimme.baum.tod": [V(L("RPG:creak2.ogg", p=0.5), L("IMP:impactWood_heavy_001.ogg", d=0.6), L("IMP:impactWood_heavy_003.ogg", d=0.78, g=-3), fade=0.3)],
    "stimme.baum.auftritt": [V(L("RPG:creak2.ogg", p=0.55), fade=0.3)],
    "stimme.krebs.angriff": [V(L("IMP:impactPlate_light_00%d.ogg" % i, p=1.5), L("IMP:impactPlate_light_00%d.ogg" % ((i + 1) % 5), p=1.55, d=0.09, g=-2), L("RPP:inventory/bubble%s.wav" % b, g=-8)) for i, b in ((0, ""), (2, "2"))],
    "stimme.krebs.schmerz": [V(L("IMP:impactTin_medium_00%d.ogg" % i, p=1.3), L("RPP:inventory/bubble3.wav", g=-6)) for i in (1, 3)],
    "stimme.krebs.tod": [V(L("IMP:impactPlate_light_004.ogg", p=1.2), L("C100:splash_02.ogg", d=0.15, g=-4))],
    "stimme.fledermaus.angriff": [V(L("CRE:scream_01.ogg", e=0.4, p=1.5)), V(L("CRE:scream_02.ogg", e=0.4, p=1.6))],
    "stimme.fledermaus.schmerz": [V(L("CRE:scream_02.ogg", e=0.3, p=1.8))],
    "stimme.fledermaus.tod": [V(L("CRE:scream_01.ogg", e=0.8, p=1.3), fade=0.3)],
    "stimme.fledermaus.auftritt": [V(L("RPG:cloth1.ogg", p=1.6), L("RPG:cloth3.ogg", p=1.7, d=0.12), L("CRE:scream_02.ogg", e=0.35, p=1.6, d=0.2, g=-3))],
    "stimme.goblin.angriff": [V(L("CRE:cute_0%d.ogg" % i, p=0.9)) for i in (2, 5)] + [V(L("CRE:weird_0%d.ogg" % i)) for i in (1, 3)],
    "stimme.goblin.schmerz": [V(L("CRE:hurt_02.ogg", p=1.2))],
    "stimme.goblin.tod": [V(L("CRE:hurt_01.ogg", p=1.1))],
    "stimme.goblin.auftritt": [V(L("CRE:weird_03.ogg", p=0.95))],
    "stimme.kultist.angriff": [V(L("CRE:grunt_01.ogg")), V(L("CRE:grunt_02.ogg"))],
    "stimme.kultist.schmerz": [V(L("CRE:hurt_04.ogg")), V(L("CRE:hurt_05.ogg"))],
    "stimme.kultist.tod": [V(L("R80:creature_hurt_01.ogg"))],
    "stimme.kultist.auftritt": [V(L("RPP:NPC/shade/shade5.wav", p=0.8), L("RPP:NPC/shade/shade7.wav", p=0.75, d=0.3, g=-4))],
    "stimme.todesritter.angriff": [V(L("CRE:monster_06.ogg", p=0.7), L("R80:chain_01.ogg", g=-6)), V(L("CRE:monster_03.ogg", p=0.7), L("R80:chain_02.ogg", g=-6))],
    "stimme.todesritter.schmerz": [V(L("CRE:grunt_03.ogg", p=0.7), L("IMP:impactPlate_light_001.ogg", g=-6))],
    "stimme.todesritter.tod": [V(L("R80:creature_die_01.ogg", p=0.85), L("IMP:impactPlate_heavy_004.ogg", d=0.45), L("R80:chain_03.ogg", d=0.5, g=-4), fade=0.3)],
    "stimme.todesritter.auftritt": [V(L("R80:chain_03.ogg"), L("CRE:monster_06.ogg", p=0.65, d=0.2, g=-2))],
    "stimme.schlund.angriff": [V(L("CRE:monster_04.ogg", p=0.75), L("R80:creature_slime_04.ogg", g=-5)), V(L("CRE:monster_07.ogg", p=0.7), L("R80:creature_slime_01.ogg", g=-5))],
    "stimme.schlund.schmerz": [V(L("CRE:burble_02.ogg", p=0.7))],
    "stimme.schlund.tod": [V(L("CRE:monster_07.ogg", p=0.6), L("C100:splash_01.ogg", d=0.3, g=-3), fade=0.3)],
    "stimme.schlund.auftritt": [V(L("CRE:monster_04.ogg", p=0.6), L("CRE:burble_01.ogg", p=0.6, d=0.2, g=-4), fade=0.3)],
    # ---------- Stimmen der Helden (das Spiel stimmt sie je Volk hoeher oder tiefer) ----------
    **{"held.w%d.angriff" % t: [fem(t, "attack", n) for n in (1, 2, 3)] for t in (1, 2, 3)},
    **{"held.w%d.schmerz" % t: [fem(t, "damaged", n) for n in (1, 2, 3)] for t in (1, 2, 3)},
    **{"held.w%d.heilung" % t: [fem(t, "healed", n) for n in (1, 2)] for t in (1, 2, 3)},
    # Kampfrufe aus den Riesenstimmen, auf Menschengroesse hochgestimmt (deutlicher als die Grunzlaute)
    "held.m.angriff": [V(L("RPP:NPC/giant/giant%d.wav" % i, p=1.15)) for i in (1, 4, 5)] + [V(L("CRE:grunt_03.ogg"))],
    "held.m.schmerz": [V(L("CRE:hurt_04.ogg")), V(L("CRE:hurt_05.ogg")), V(L("RPP:NPC/ogre/ogre5.wav", p=1.2)), V(L("R80:creature_hurt_01.ogg", p=1.05))],
    "held.gross.angriff": [V(L("RPP:NPC/giant/giant%d.wav" % i)) for i in (1, 4, 5)] + [V(L("CRE:troll_01.ogg"))],
    "held.gross.schmerz": [V(L("RPP:NPC/ogre/ogre5.wav")), V(L("RPP:NPC/giant/giant3.wav"))],
    # ---------- Welt und Bedienung ----------
    "ui.klick": [V(L("RPP:interface/interface%d.wav" % i, g=-2)) for i in (1, 2, 3)],
    "ui.seite": [V(L("RPG:bookFlip%d.ogg" % i)) for i in (1, 2, 3)],
    "ui.muenzen": [V(L("RPG:handleCoins.ogg")), V(L("RPG:handleCoins2.ogg")), V(L("R80:item_coins_0%d.ogg" % 1)), V(L("R80:item_coins_0%d.ogg" % 3))],
    "ui.kaufen": [V(L("RPP:inventory/coin%s.wav" % n), L("R80:item_misc_01.ogg", d=0.12, g=-6)) for n in ("2", "3")],
    "ui.tuer": [V(L("RPG:doorOpen_1.ogg")), V(L("RPG:doorOpen_2.ogg"))],
    "ui.amboss": [V(L("IMP:impactMetal_heavy_00%d.ogg" % i, p=1.2), L("IMP:impactBell_heavy_00%d.ogg" % i, p=1.4, g=-9)) for i in (0, 2)],
    "ui.ausruesten": [V(L("RPP:inventory/chainmail1.wav")), V(L("RPP:inventory/armor-light.wav")), V(L("RPP:inventory/cloth-heavy.wav"))],
    "ui.edelstein": [V(L("R80:item_gem_0%d.ogg" % i)) for i in (1, 2, 3)],
    "ui.truhe": [V(L("C100:wooded_box_open.ogg"))],
    "ui.brunnen": [V(L("RPP:inventory/coin.wav"), L("C100:splash_02.ogg", d=0.35, g=-3))],
    "schritt.schnee": [V(L("IMP:footstep_snow_00%d.ogg" % i)) for i in range(5)],
    "schritt.gras": [V(L("IMP:footstep_grass_00%d.ogg" % i)) for i in range(5)],
    "schritt.stein": [V(L("IMP:footstep_concrete_00%d.ogg" % i)) for i in range(5)],
}

CACHE = {}


def load(path):
    if path not in CACHE:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(ROOT, path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True)
        if raw.returncode or not raw.stdout:
            raise SystemExit("Datei fehlt oder ist kaputt: " + path + " " + raw.stderr.decode()[:200])
        CACHE[path] = np.frombuffer(raw.stdout, np.float32).copy()
    return CACHE[path]


def active(x):
    a = np.abs(x)
    idx = np.nonzero(a > a.max() * 0.03)[0]
    if not len(idx):
        return 0, len(x)
    return max(0, idx[0] - int(0.01 * SR)), min(len(x), idx[-1] + int(0.12 * SR))


def layer(sp):
    x = load(sp["f"])
    if sp["s"] is None and sp["e"] is None:
        a, b = active(x)
    else:
        a = int((sp["s"] or 0) * SR)
        b = int(sp["e"] * SR) if sp["e"] is not None else len(x)
        a2, b2 = active(x[a:b])
        a, b = a + a2, a + b2
    y = x[a:b]
    if sp["p"] != 1.0:
        # Tonhoehe wie schnelleres oder langsameres Abspielen (tiefer klingt groesser und langsamer)
        t = np.arange(0, len(y) - 1, sp["p"])
        y = np.interp(t, np.arange(len(y)), y).astype(np.float32)
    return y * (10 ** (sp["g"] / 20)), int(sp["d"] * SR)


def render(v):
    parts = [layer(sp) for sp in v["layers"]]
    n = max(off + len(y) for y, off in parts)
    out = np.zeros(n, np.float32)
    for y, off in parts:
        out[off:off + len(y)] += y
    a, b = active(out)
    out = out[a:b]
    if v["maxlen"]:
        out = out[: int(v["maxlen"] * SR)]
    fi = min(len(out), int(0.003 * SR))
    out[:fi] *= np.linspace(0, 1, fi)
    fo = min(len(out), int(v["fade"] * SR))
    out[len(out) - fo:] *= np.linspace(1, 0, fo)
    pk = np.abs(out).max()
    return out * (0.89 / pk) if pk > 0 else out


def mp3(x):
    r = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-c:a", "libmp3lame", "-b:a", "64k", "-f", "mp3", "-"],
                       input=x.astype(np.float32).tobytes(), capture_output=True)
    if r.returncode:
        raise SystemExit(r.stderr.decode()[:300])
    return r.stdout


blobs, header, info = [], {}, {}
off = 0
for name, variants in BANK.items():
    header[name] = []
    for i, v in enumerate(variants):
        x = render(v)
        b = mp3(x)
        header[name].append({"$": ["img", off, len(b), "audio/mpeg"]})
        blobs.append(b)
        pad = (4 - len(b) % 4) % 4
        blobs.append(b"\0" * pad)
        off += len(b) + pad
        info.setdefault(name, []).append(round(len(x) / SR, 2))
        if PREV:
            os.makedirs(PREV, exist_ok=True)
            open(os.path.join(PREV, "%s.%d.mp3" % (name, i + 1)), "wb").write(b)
hj = json.dumps({"klang": header}, separators=(",", ":")).encode()
with open(OUT, "wb") as f:
    f.write(struct.pack("<II", 0x31504253, len(hj)))
    f.write(hj)
    f.write(b"\0" * ((4 - (8 + len(hj)) % 4) % 4))
    for b in blobs:
        f.write(b)
print("Klaenge", len(BANK), "Varianten", sum(len(v) for v in BANK.values()), "Groesse", round(os.path.getsize(OUT) / 1024), "KB")
if PREV:
    json.dump(info, open(os.path.join(PREV, "laengen.json"), "w"), ensure_ascii=False, indent=0)
