export const AltitudeTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-base-100 p-2 border border-base-300 rounded shadow-md text-xs">
                <p className="font-semibold text-primary">
                    {`${Math.round(Number(payload[0].value))}m Altitude`}
                </p>
            </div>
        );
    }
    return null;
};