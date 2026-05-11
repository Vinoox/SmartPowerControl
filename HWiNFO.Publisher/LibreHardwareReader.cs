using LibreHardwareMonitor.Hardware;

namespace HWiNFO.Publisher;

public class LibreHardwareReader : ICpuTemperatureReader, IDisposable
{
    private readonly Computer _computer;

    private class UpdateVisitor : IVisitor
    {
        public void VisitComputer(IComputer computer) { computer.Traverse(this); }
        public void VisitHardware(IHardware hardware)
        {
            hardware.Update();
            foreach (IHardware subHardware in hardware.SubHardware) subHardware.Accept(this);
        }
        public void VisitSensor(ISensor sensor) { }
        public void VisitParameter(IParameter parameter) { }
    }

    public LibreHardwareReader()
    {
        _computer = new Computer { IsCpuEnabled = true };
        _computer.Open();
    }

    public float? GetCurrentTemperature()
    {
        _computer.Accept(new UpdateVisitor());

        foreach (var hardware in _computer.Hardware)
        {
            if (hardware.HardwareType != HardwareType.Cpu) continue;

            foreach (var sensor in hardware.Sensors)
            {
                if (sensor.SensorType == SensorType.Temperature && sensor.Name.Contains("Package"))
                {
                    return sensor.Value;
                }
            }
        }
        return null;
    }

    public void Dispose()
    {
        _computer.Close();
    }
}