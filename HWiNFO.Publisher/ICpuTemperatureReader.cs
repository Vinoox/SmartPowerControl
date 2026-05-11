namespace HWiNFO.Publisher;

public interface ICpuTemperatureReader
{
    float? GetCurrentTemperature();
}