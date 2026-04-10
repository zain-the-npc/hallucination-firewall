import math

# Platt Scaling applied — replaces manual display capping (v2 calibration)
def calibrate_score(raw_score: float, a: float = 1.0, b: float = -0.5) -> float:
    """
    Applies Platt Scaling (sigmoid calibration) to a raw classifier score.
    calibrated_score = 1 / (1 + exp(-(a * raw_score + b)))
    """
    try:
        calibrated_score = 1.0 / (1.0 + math.exp(-(a * raw_score + b)))
        return round(calibrated_score, 4)
    except OverflowError:
        return 0.0 if (a * raw_score + b) < 0 else 1.0
