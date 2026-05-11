namespace SmartPower.Controller;

public class PowerSystemState
{
    // Odczyty na żywo
    public double CurrentTemperature { get; set; }
    public int CurrentMode { get; set; } = -1; // -1: Nieznany, 0: Balanced, 1: Turbo, 2: Silent

    // Konfiguracja progów (teraz można je zmieniać!)
    public double ThresholdTurbo { get; set; } = 60.0; // Do tej temperatury pełna moc
    public double ThresholdSilent { get; set; } = 80.0; // Od tej temperatury ostre dławienie mocy
    public double Hysteresis { get; set; } = 3.0;
}