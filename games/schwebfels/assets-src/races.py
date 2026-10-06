"""Koerperprofile der zwoelf Voelker (je Reich vier) nach den Konzepttafeln 01 bis 03.

macro: MakeHuman-Makrowerte (0..1, Mitte 0.5). detail: feine Zielformen (Vorzeichen waehlt decr/incr).
H: Zielgroesse in Spieleinheiten (ein durchschnittlicher Mensch ist 2,0 hoch, wie bisher im Spiel).
ears: 'human', 'elf' (lang spitz), 'leaf' (breit spitz), 'wicht' (sehr lang), 'tip' (leicht spitz).
"""

COMMON_F = {"lr-eye-scale": 0.1}

RACES = {
    # Albion
    "albier": dict(
        m=dict(macro=dict(gender=1.0, muscle=0.58, weight=0.5, height=0.55, proportions=0.75), detail={"lr-cheek-bones": 0.2}, H=2.0),
        f=dict(macro=dict(gender=0.0, muscle=0.55, weight=0.48, height=0.55, proportions=0.75), detail={"lr-cheek-bones": 0.25}, H=1.9),
        ears="human",
    ),
    "kreidezwerg": dict(
        m=dict(macro=dict(gender=1.0, muscle=0.85, weight=0.78, height=0.35, proportions=0.4),
               detail={"measure-upperleg-height": -1.0, "measure-lowerleg-height": -1.0, "measure-lowerarm-length": -0.6, "measure-upperarm-length": -0.5,
                       "torso-scale-horiz": 0.7, "measure-shoulder-dist": 0.8, "lr-hand-scale": 0.6, "lr-foot-scale": 0.4, "neck-scale-vert": -0.8,
                       "head-square": 0.6, "chin-width": 0.6, "nose-volume": 0.7, "nose-scale-horiz": 0.4, "eyebrows-trans-forward": 0.5, "head-scale-horiz": 0.3},
               H=1.62),
        f=dict(macro=dict(gender=0.0, muscle=0.8, weight=0.75, height=0.35, proportions=0.45),
               detail={"measure-upperleg-height": -1.0, "measure-lowerleg-height": -1.0, "measure-lowerarm-length": -0.6, "measure-upperarm-length": -0.5,
                       "torso-scale-horiz": 0.6, "measure-shoulder-dist": 0.6, "lr-hand-scale": 0.5, "neck-scale-vert": -0.7, "head-round": 0.5, "nose-volume": 0.5},
               H=1.54),
        ears="human",
    ),
    "klippengeboren": dict(
        m=dict(macro=dict(gender=1.0, muscle=0.92, weight=0.6, height=0.55, proportions=0.8),
               detail={"head-square": 0.5, "chin-width": 0.5, "chin-bones": 0.5, "lr-cheek-bones": 0.5, "measure-shoulder-dist": 0.5, "torso-vshape": 0.4}, H=2.24),
        f=dict(macro=dict(gender=0.0, muscle=0.88, weight=0.58, height=0.55, proportions=0.8),
               detail={"chin-bones": 0.4, "lr-cheek-bones": 0.6, "measure-shoulder-dist": 0.5, "torso-vshape": 0.3}, H=2.14),
        ears="human",
    ),
    "daemmerblut": dict(
        m=dict(macro=dict(gender=1.0, muscle=0.42, weight=0.3, height=0.65, proportions=0.9),
               detail={"head-oval": 0.5, "lr-cheek-bones": 0.5, "nose-point-width": -0.4, "chin-height": 0.3, "lr-eye-scale": 0.25}, H=2.04),
        f=dict(macro=dict(gender=0.0, muscle=0.4, weight=0.28, height=0.65, proportions=0.9),
               detail={"head-oval": 0.5, "lr-cheek-bones": 0.5, "nose-point-width": -0.5, "lr-eye-scale": 0.3}, H=1.96),
        ears="tip",
    ),
    # Midgard
    "nordmann": dict(
        m=dict(macro=dict(gender=1.0, muscle=0.75, weight=0.55, height=0.66, proportions=0.8), detail={"chin-width": 0.4, "lr-cheek-bones": 0.3, "head-square": 0.3}, H=2.12),
        f=dict(macro=dict(gender=0.0, muscle=0.62, weight=0.45, height=0.62, proportions=0.8),
               detail={"lr-cheek-bones": 0.5, "chin-prominent": 0.25, "nose-point-width": -0.3, "lr-eye-scale": 0.15, "mouth-lowerlip-volume": 0.2}, H=2.0),
        ears="human",
    ),
    "trollblut": dict(
        m=dict(macro=dict(gender=1.0, muscle=1.0, weight=0.85, height=0.5, proportions=0.45),
               detail={"torso-vshape": 0.8, "measure-shoulder-dist": 1.0, "neck-scale-horiz": 0.9, "lr-hand-scale": 0.7, "lr-upperarm-muscle": 0.6,
                       "chin-prognathism": 0.7, "chin-width": 0.8, "mouth-scale-horiz": 0.5, "nose-scale-horiz": 0.6, "nose-volume": 0.6,
                       "eyebrows-trans-forward": 1.0, "forehead-trans-backward": 0.5, "head-square": 0.5, "lr-eye-scale": -0.3}, H=2.34),
        f=dict(macro=dict(gender=0.0, muscle=0.95, weight=0.8, height=0.5, proportions=0.5),
               detail={"torso-vshape": 0.5, "measure-shoulder-dist": 0.8, "neck-scale-horiz": 0.6, "lr-hand-scale": 0.5,
                       "chin-prognathism": 0.5, "chin-width": 0.5, "nose-scale-horiz": 0.4, "eyebrows-trans-forward": 0.7, "lr-eye-scale": -0.15}, H=2.22),
        ears="elf", horns=True, tusks=True,
    ),
    "frostwicht": dict(
        m=dict(macro=dict(gender=1.0, muscle=0.5, weight=0.18, height=0.4, proportions=0.7),
               detail={"head-scale-horiz": -0.3, "chin-height": 0.4, "head-triangular": 0.4, "lr-cheek-bones": 0.6, "nose-point-width": -0.5, "lr-eye-scale": 0.2}, H=1.56),
        f=dict(macro=dict(gender=0.0, muscle=0.45, weight=0.16, height=0.4, proportions=0.7),
               detail={"head-scale-horiz": -0.3, "head-triangular": 0.4, "lr-cheek-bones": 0.6, "nose-point-width": -0.5, "lr-eye-scale": 0.25}, H=1.5),
        ears="wicht",
    ),
    "glutzwerg": dict(
        m=dict(macro=dict(gender=1.0, muscle=0.88, weight=0.8, height=0.35, proportions=0.4),
               detail={"measure-upperleg-height": -1.0, "measure-lowerleg-height": -1.0, "measure-lowerarm-length": -0.6, "measure-upperarm-length": -0.5,
                       "torso-scale-horiz": 0.8, "measure-shoulder-dist": 0.9, "lr-hand-scale": 0.7, "neck-scale-vert": -0.9, "head-square": 0.5,
                       "chin-width": 0.7, "nose-scale-horiz": 0.6, "eyebrows-trans-forward": 0.6}, H=1.62),
        f=dict(macro=dict(gender=0.0, muscle=0.85, weight=0.78, height=0.35, proportions=0.45),
               detail={"measure-upperleg-height": -1.0, "measure-lowerleg-height": -1.0, "measure-lowerarm-length": -0.6, "measure-upperarm-length": -0.5,
                       "torso-scale-horiz": 0.7, "measure-shoulder-dist": 0.7, "lr-hand-scale": 0.5, "neck-scale-vert": -0.8, "head-round": 0.4}, H=1.54),
        ears="human",
    ),
    # Hibernia
    "sidhe": dict(
        m=dict(macro=dict(gender=1.0, muscle=0.45, weight=0.3, height=0.78, proportions=0.95),
               detail={"head-oval": 0.6, "lr-cheek-bones": 0.6, "nose-point-width": -0.4, "chin-height": 0.2, "lr-eye-scale": 0.2, "lr-eye-corner1": 0.3}, H=2.14),
        f=dict(macro=dict(gender=0.0, muscle=0.4, weight=0.28, height=0.78, proportions=0.95),
               detail={"head-oval": 0.6, "lr-cheek-bones": 0.6, "nose-point-width": -0.5, "lr-eye-scale": 0.3, "lr-eye-corner1": 0.4}, H=2.04),
        ears="elf",
    ),
    "moorling": dict(
        m=dict(macro=dict(gender=1.0, muscle=0.6, weight=0.75, height=0.3, proportions=0.3),
               detail={"measure-upperleg-height": -0.8, "measure-lowerleg-height": -0.8, "head-round": 0.7, "nose-volume": 0.9, "nose-point-width": 0.6,
                       "lr-cheek-volume": 0.6, "mouth-scale-horiz": 0.3, "lr-hand-scale": 0.3, "neck-scale-vert": -0.5}, H=1.5),
        f=dict(macro=dict(gender=0.0, muscle=0.5, weight=0.62, height=0.3, proportions=0.4),
               detail={"measure-upperleg-height": -0.8, "measure-lowerleg-height": -0.8, "head-round": 0.7, "nose-volume": 0.6, "lr-cheek-volume": 0.6, "neck-scale-vert": -0.4}, H=1.44),
        ears="leaf",
    ),
    "hainriese": dict(
        m=dict(macro=dict(gender=1.0, muscle=0.98, weight=0.8, height=0.5, proportions=0.5),
               detail={"measure-shoulder-dist": 0.8, "torso-vshape": 0.6, "neck-scale-horiz": 0.6, "lr-hand-scale": 0.5, "head-square": 0.5, "chin-width": 0.6,
                       "nose-scale-horiz": 0.3, "eyebrows-trans-forward": 0.5}, H=2.38),
        f=dict(macro=dict(gender=0.0, muscle=0.92, weight=0.75, height=0.5, proportions=0.5),
               detail={"measure-shoulder-dist": 0.6, "torso-vshape": 0.4, "neck-scale-horiz": 0.4, "lr-hand-scale": 0.4, "chin-width": 0.3}, H=2.26),
        ears="human",
    ),
    "dornling": dict(
        m=dict(macro=dict(gender=1.0, muscle=0.55, weight=0.32, height=0.6, proportions=0.85),
               detail={"lr-cheek-bones": 0.6, "head-triangular": 0.3, "nose-point-width": -0.3, "lr-eye-scale": 0.15}, H=2.0),
        f=dict(macro=dict(gender=0.0, muscle=0.5, weight=0.3, height=0.6, proportions=0.85),
               detail={"lr-cheek-bones": 0.6, "head-triangular": 0.3, "nose-point-width": -0.4, "lr-eye-scale": 0.2}, H=1.92),
        ears="tip", horns=True,
    ),
}

ORDER = ["albier", "kreidezwerg", "klippengeboren", "daemmerblut", "nordmann", "trollblut", "frostwicht", "glutzwerg", "sidhe", "moorling", "hainriese", "dornling"]
