import { Rocket } from "lucide-react";

export const ComingSoonOverlay = ({ children, color = "blue" }) => (
    <div className="relative min-h-[120px]">
        <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center rounded-xl">
            <div className="text-center p-4">
                <div className={`w-10 h-10 bg-${color}-100 rounded-full flex items-center justify-center mx-auto mb-2`}>
                    <Rocket className={`w-5 h-5 text-${color}-500`} />
                </div>
                <p className="font-semibold text-gray-800 text-sm">Coming Soon</p>
                <p className="text-[10px] text-gray-500 mt-0.5">This feature is being built</p>
            </div>
        </div>
        <div className="opacity-30 pointer-events-none">
            {children}
        </div>
    </div>
);
