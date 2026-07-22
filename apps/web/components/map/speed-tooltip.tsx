export const SpeedTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-base-100 p-2 border border-base-300 rounded shadow-md text-xs">
                <p className="font-semibold text-error">
                    {`${Number(payload[0].value).toFixed(1)} km/h Speed`}
                </p>
            </div>
        );
    }
    return null;
};