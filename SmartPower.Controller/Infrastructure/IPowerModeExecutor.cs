using SmartPower.Controller.Domain;

namespace SmartPower.Controller.Infrastructure;

public interface IPowerModeExecutor
{
    void SetMode(PowerMode mode);
}