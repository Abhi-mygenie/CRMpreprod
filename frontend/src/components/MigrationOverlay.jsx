import { useState, useEffect } from "react";
import { toast } from "sonner";
import { RefreshCw, Users, ShoppingBag, Check, X, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function MigrationOverlay({ api, onClose, onComplete }) {
    const [migrationStatus, setMigrationStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [syncingCustomers, setSyncingCustomers] = useState(false);
    const [syncingOrders, setSyncingOrders] = useState(false);
    const [confirmingMigration, setConfirmingMigration] = useState(false);
    const [customerSyncProgress, setCustomerSyncProgress] = useState(null);
    const [orderSyncProgress, setOrderSyncProgress] = useState(null);

    useEffect(() => {
        fetchMigrationStatus();
    }, []);

    const fetchMigrationStatus = async () => {
        try {
            const res = await api.get("/migration/status");
            setMigrationStatus(res.data);
        } catch (err) {
            console.error("Failed to fetch migration status", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncCustomers = async () => {
        setSyncingCustomers(true);
        setCustomerSyncProgress({ synced: 0, updated: 0, total: 0 });
        try {
            await api.post("/customers/sync-from-mygenie");
            
            // Poll for status
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await api.get("/customers/sync-status");
                    setCustomerSyncProgress({
                        synced: statusRes.data.synced || 0,
                        updated: statusRes.data.updated || 0,
                        total: statusRes.data.total_customers || 0,
                        status: statusRes.data.status
                    });
                    
                    if (statusRes.data.status === "completed" || statusRes.data.status === "failed") {
                        clearInterval(pollInterval);
                        setSyncingCustomers(false);
                        fetchMigrationStatus();
                        if (statusRes.data.status === "completed") {
                            toast.success(`Customers synced: ${statusRes.data.synced} new, ${statusRes.data.updated} updated`);
                        }
                    }
                } catch (err) {
                    clearInterval(pollInterval);
                    setSyncingCustomers(false);
                }
            }, 1000);
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to sync customers");
            setSyncingCustomers(false);
        }
    };

    const handleSyncOrders = async () => {
        setSyncingOrders(true);
        setOrderSyncProgress({ synced: 0, total: 0 });
        try {
            await api.post("/migration/sync-orders");
            
            // Poll for status
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await api.get("/migration/sync-orders/status");
                    const totalProcessed = (statusRes.data.synced || 0) + (statusRes.data.updated || 0);
                    setOrderSyncProgress({
                        synced: totalProcessed,
                        total: statusRes.data.total_orders || 0,
                        status: statusRes.data.status,
                        currentPage: statusRes.data.current_page || 0,
                        totalPages: statusRes.data.total_pages || 0
                    });
                    
                    if (statusRes.data.status === "completed" || statusRes.data.status === "failed") {
                        clearInterval(pollInterval);
                        setSyncingOrders(false);
                        fetchMigrationStatus();
                        if (statusRes.data.status === "completed") {
                            toast.success(`Orders synced: ${totalProcessed}`);
                        }
                    }
                } catch (err) {
                    clearInterval(pollInterval);
                    setSyncingOrders(false);
                }
            }, 2000);
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to sync orders");
            setSyncingOrders(false);
        }
    };

    const handleRevertCustomers = async () => {
        try {
            await api.post("/migration/revert-customers");
            toast.success("Customers reverted successfully");
            fetchMigrationStatus();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to revert customers");
        }
    };

    const handleRevertOrders = async () => {
        try {
            await api.post("/migration/revert-orders");
            toast.success("Orders reverted successfully");
            fetchMigrationStatus();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to revert orders");
        }
    };

    const handleConfirmMigration = async () => {
        setConfirmingMigration(true);
        try {
            await api.post("/migration/confirm");
            toast.success("Migration confirmed!");
            onComplete();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to confirm migration");
        } finally {
            setConfirmingMigration(false);
        }
    };

    const handleSkipPermanently = async () => {
        try {
            await api.post("/migration/skip-permanently");
            toast.success("Migration skipped");
            onComplete();
        } catch (err) {
            toast.error("Failed to skip migration");
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
                <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#F26B33]" />
                    <p className="mt-4 text-[#52525B]">Loading migration status...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b bg-gradient-to-r from-[#F26B33] to-[#329937] rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                            <RefreshCw className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white font-heading">Data Migration</h2>
                            <p className="text-white/80 text-sm font-body">Sync your data from MyGenie POS</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Step 1: Sync Customers */}
                    <div className="border rounded-xl p-4 bg-[#F5F5F5]">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#F26B33]/20 flex items-center justify-center text-[#F26B33] font-semibold text-sm">1</div>
                                <div>
                                    <h3 className="font-semibold text-[#2B2B2B] font-body">Sync Customers</h3>
                                    {migrationStatus?.customers_synced > 0 && (
                                        <p className="text-xs text-[#329937] flex items-center gap-1 font-body">
                                            <Check className="w-3 h-3" /> {migrationStatus.customers_synced.toLocaleString()}{migrationStatus.total_customers_in_pos > 0 ? ` / ${migrationStatus.total_customers_in_pos.toLocaleString()}` : ''} synced
                                        </p>
                                    )}
                                </div>
                            </div>
                            <Users className="w-5 h-5 text-[#52525B]" />
                        </div>
                        
                        {syncingCustomers && customerSyncProgress && (
                            <div className="mb-3">
                                <Progress value={customerSyncProgress.total > 0 ? (customerSyncProgress.synced + customerSyncProgress.updated) / customerSyncProgress.total * 100 : 0} className="h-2" />
                                <p className="text-xs text-[#52525B] mt-1">
                                    Syncing... {customerSyncProgress.synced} new, {customerSyncProgress.updated} updated
                                </p>
                            </div>
                        )}
                        
                        <div className="flex gap-2">
                            <Button
                                onClick={handleSyncCustomers}
                                disabled={syncingCustomers}
                                className="flex-1 h-10 rounded-xl bg-[#F26B33] hover:bg-[#D85A2A]"
                                data-testid="migration-sync-customers"
                            >
                                {syncingCustomers ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Syncing...</>
                                ) : migrationStatus?.customers_synced > 0 ? "Sync Again" : "Sync Customers"}
                            </Button>
                            {migrationStatus?.customers_synced > 0 && (
                                migrationStatus?.orders_synced > 0 ? (
                                    <Button 
                                        variant="outline" 
                                        className="h-10 rounded-xl text-gray-400 border-gray-200 cursor-not-allowed"
                                        disabled
                                        title="Revert orders first"
                                    >
                                        Revert
                                    </Button>
                                ) : (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="outline" className="h-10 rounded-xl text-red-600 border-red-200 hover:bg-red-50">
                                                Revert
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Revert Customer Sync?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will delete all {migrationStatus.customers_synced} synced customers. This action cannot be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleRevertCustomers} className="bg-red-600 hover:bg-red-700">
                                                    Revert
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )
                            )}
                        </div>
                        {migrationStatus?.customers_synced > 0 && migrationStatus?.orders_synced > 0 && (
                            <p className="text-xs text-[#A1A1AA] mt-2 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Revert orders first to revert customers
                            </p>
                        )}
                    </div>

                    {/* Step 2: Sync Orders */}
                    <div className="border rounded-xl p-4 bg-[#F5F5F5]">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#F26B33]/20 flex items-center justify-center text-[#F26B33] font-semibold text-sm">2</div>
                                <div>
                                    <h3 className="font-semibold text-[#2B2B2B] font-body">Sync Orders</h3>
                                    {migrationStatus?.orders_synced > 0 && (
                                        <p className="text-xs text-[#329937] flex items-center gap-1 font-body">
                                            <Check className="w-3 h-3" /> {migrationStatus.orders_synced.toLocaleString()}{migrationStatus.total_orders_in_pos > 0 ? ` / ${migrationStatus.total_orders_in_pos.toLocaleString()}` : ''} synced
                                        </p>
                                    )}
                                </div>
                            </div>
                            <ShoppingBag className="w-5 h-5 text-[#52525B]" />
                        </div>
                        
                        {syncingOrders && orderSyncProgress && (
                            <div className="mb-3">
                                <Progress value={orderSyncProgress.totalPages > 0 ? (orderSyncProgress.currentPage / orderSyncProgress.totalPages) * 100 : 0} className="h-2" />
                                <p className="text-xs text-[#52525B] mt-1 font-body">
                                    Syncing... {orderSyncProgress.synced.toLocaleString()} of {orderSyncProgress.total.toLocaleString()} orders (Page {orderSyncProgress.currentPage}/{orderSyncProgress.totalPages})
                                </p>
                            </div>
                        )}
                        
                        <div className="flex gap-2">
                            <Button
                                onClick={handleSyncOrders}
                                disabled={syncingOrders || !migrationStatus?.customers_synced}
                                className="flex-1 h-10 rounded-xl bg-[#F26B33] hover:bg-[#D85A2A]"
                                data-testid="migration-sync-orders"
                            >
                                {syncingOrders ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Syncing...</>
                                ) : migrationStatus?.orders_synced > 0 ? "Sync Again" : "Sync Orders"}
                            </Button>
                            {migrationStatus?.orders_synced > 0 && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" className="h-10 rounded-xl text-red-600 border-red-200 hover:bg-red-50">
                                            Revert
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Revert Order Sync?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will delete all {migrationStatus.orders_synced} synced orders. This action cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleRevertOrders} className="bg-red-600 hover:bg-red-700">
                                                Revert
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                        {!migrationStatus?.customers_synced && (
                            <p className="text-xs text-[#A1A1AA] mt-2 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Sync customers first
                            </p>
                        )}
                    </div>

                    {/* Step 3: Confirm Migration */}
                    <div className="border rounded-xl p-4 bg-[#F5F5F5]">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#329937]/20 flex items-center justify-center text-[#329937] font-semibold text-sm">3</div>
                                <div>
                                    <h3 className="font-semibold text-[#2B2B2B] font-body">Confirm Migration</h3>
                                    <p className="text-xs text-[#52525B] font-body">Finalize and complete the migration</p>
                                </div>
                            </div>
                            <Check className="w-5 h-5 text-[#52525B]" />
                        </div>
                        
                        <Button
                            onClick={handleConfirmMigration}
                            disabled={confirmingMigration || (!migrationStatus?.customers_synced && !migrationStatus?.orders_synced)}
                            className="w-full h-10 rounded-xl bg-[#329937] hover:bg-[#287A2D]"
                            data-testid="migration-confirm"
                        >
                            {confirmingMigration ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Confirming...</>
                            ) : (
                                <><Check className="w-4 h-4 mr-2" /> Complete Migration</>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t bg-[#F5F5F5] rounded-b-2xl">
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            className="flex-1 h-11 rounded-xl font-body border-[#F26B33] text-[#F26B33] hover:bg-[#F26B33] hover:text-white"
                            data-testid="migration-skip"
                        >
                            Skip for Now
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="ghost"
                                    className="flex-1 h-11 rounded-xl text-[#52525B] hover:text-[#2B2B2B] font-body"
                                    data-testid="migration-skip-permanently"
                                >
                                    Don't Need Migration
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Skip Migration Permanently?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will hide the migration overlay permanently. You can still access migration from Settings later.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleSkipPermanently}>
                                        Yes, Skip Permanently
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
            </div>
        </div>
    );
}
