import { useState, useEffect } from "react";
import { toast } from "sonner";
import { RefreshCw, Check, RotateCcw, Users, ShoppingCart } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";

export default function MigrationPage() {
    const { api } = useAuth();
    const [migrationStatus, setMigrationStatus] = useState(null);
    const [migrationLoading, setMigrationLoading] = useState(false);
    const [syncingCustomers, setSyncingCustomers] = useState(false);
    const [syncingOrders, setSyncingOrders] = useState(false);
    const [confirmingMigration, setConfirmingMigration] = useState(false);
    const [revertingCustomers, setRevertingCustomers] = useState(false);
    const [revertingOrders, setRevertingOrders] = useState(false);

    useEffect(() => { fetchMigrationStatus(); }, []);

    const fetchMigrationStatus = async () => {
        setMigrationLoading(true);
        try { const res = await api.get("/migration/status"); setMigrationStatus(res.data); }
        catch (_) { toast.error("Failed to load migration status"); }
        finally { setMigrationLoading(false); }
    };

    const handleSyncCustomers = async () => {
        setSyncingCustomers(true);
        try {
            const res = await api.post("/customers/sync-from-mygenie");
            if (res.data.status === "started") {
                toast.info("Customer sync started...");
                const pollStatus = async () => {
                    try {
                        const statusRes = await api.get("/customers/sync-status");
                        const status = statusRes.data;
                        if (status.status === "running") {
                            const processed = status.synced + status.updated;
                            const total = status.total_customers || 0;
                            const roundTo = total > 500 ? 100 : 10;
                            const displayProcessed = Math.floor(processed / roundTo) * roundTo;
                            toast.loading(`Syncing customers... ${displayProcessed}/${total}`, { id: "customer-sync-progress" });
                            setTimeout(pollStatus, 1000);
                        } else if (status.status === "completed") {
                            toast.dismiss("customer-sync-progress");
                            toast.success(`Synced ${status.synced} new, updated ${status.updated} customers`);
                            setSyncingCustomers(false);
                            fetchMigrationStatus();
                        } else if (status.status === "failed") {
                            toast.dismiss("customer-sync-progress");
                            toast.error(status.error || "Sync failed");
                            setSyncingCustomers(false);
                            fetchMigrationStatus();
                        } else { setSyncingCustomers(false); }
                    } catch (err) { toast.dismiss("customer-sync-progress"); setSyncingCustomers(false); }
                };
                setTimeout(pollStatus, 500);
            } else { toast.error(res.data.message || "Failed to start sync"); setSyncingCustomers(false); }
        } catch (err) { toast.error(err.response?.data?.detail || "Failed to sync customers"); setSyncingCustomers(false); }
    };

    const handleSyncOrders = async () => {
        setSyncingOrders(true);
        try {
            const res = await api.post("/migration/sync-orders");
            if (res.data.status === "started") {
                toast.info("Order sync started. This may take a few minutes...");
                const pollStatus = async () => {
                    try {
                        const statusRes = await api.get("/migration/sync-orders/status");
                        const status = statusRes.data;
                        if (status.status === "running") {
                            const processed = status.synced + status.updated;
                            const total = status.total_orders || 0;
                            const displayProcessed = Math.floor(processed / 100) * 100;
                            toast.loading(`Syncing orders... ${displayProcessed}/${total}`, { id: "sync-progress" });
                            setTimeout(pollStatus, 2000);
                        } else if (status.status === "completed") {
                            toast.dismiss("sync-progress");
                            toast.success(`Synced ${status.synced} new, updated ${status.updated} orders`);
                            setSyncingOrders(false);
                            fetchMigrationStatus();
                        } else if (status.status === "failed") {
                            toast.dismiss("sync-progress");
                            toast.error(status.error || "Sync failed");
                            setSyncingOrders(false);
                            fetchMigrationStatus();
                        } else { setSyncingOrders(false); }
                    } catch (err) { toast.dismiss("sync-progress"); setSyncingOrders(false); }
                };
                setTimeout(pollStatus, 1000);
            } else { toast.error(res.data.message || "Failed to start sync"); setSyncingOrders(false); }
        } catch (err) { toast.error(err.response?.data?.detail || "Failed to sync orders"); setSyncingOrders(false); }
    };

    const handleConfirmMigration = async () => {
        setConfirmingMigration(true);
        try { await api.post("/migration/confirm"); toast.success("Migration confirmed successfully!"); fetchMigrationStatus(); }
        catch (err) { toast.error(err.response?.data?.detail || "Failed to confirm migration"); }
        finally { setConfirmingMigration(false); }
    };

    const handleRevertCustomers = async () => {
        setRevertingCustomers(true);
        try { const res = await api.post("/migration/revert-customers"); toast.success(`${res.data.customers_deleted} customers deleted`); fetchMigrationStatus(); }
        catch (err) { toast.error(err.response?.data?.detail || "Failed to revert customers"); }
        finally { setRevertingCustomers(false); }
    };

    const handleRevertOrders = async () => {
        setRevertingOrders(true);
        try { const res = await api.post("/migration/revert-orders"); toast.success(`${res.data.orders_deleted} orders deleted`); fetchMigrationStatus(); }
        catch (err) { toast.error(err.response?.data?.detail || "Failed to revert orders"); }
        finally { setRevertingOrders(false); }
    };

    return (
        <ResponsiveLayout>
            <div className="p-4 lg:p-6 xl:p-8 max-w-3xl mx-auto">
                <h1 className="text-2xl font-bold text-[#2B2B2B] mb-6 font-heading" data-testid="migration-title">Migration</h1>

                {migrationLoading ? (
                    <div className="animate-pulse space-y-4">
                        <div className="h-32 bg-gray-200 rounded-xl"></div>
                        <div className="h-32 bg-gray-200 rounded-xl"></div>
                    </div>
                ) : migrationStatus?.migration_confirmed ? (
                    <Card className="rounded-xl border-0 shadow-sm bg-green-50">
                        <CardContent className="p-6 text-center">
                            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                                <Check className="w-8 h-8 text-green-600" />
                            </div>
                            <p className="font-semibold text-green-800 text-lg">Migration Complete</p>
                            <p className="text-sm text-green-600 mt-2">{migrationStatus.customers_synced} customers synced</p>
                            <p className="text-xs text-green-500 mt-1">Confirmed on {new Date(migrationStatus.migration_confirmed_at).toLocaleDateString()}</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        <Card className="rounded-xl border-0 shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                        <RefreshCw className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-[#1A1A1A]">Data Migration</p>
                                        <p className="text-xs text-[#52525B] mt-1">Sync your data from MyGenie POS</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Step 1: Sync Customers */}
                        <Card className="rounded-xl border-0 shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">1</div>
                                        <div>
                                            <p className="font-medium text-[#1A1A1A]">Sync Customers</p>
                                            <p className="text-xs text-[#52525B]">Import customers from MyGenie</p>
                                        </div>
                                    </div>
                                    {migrationStatus?.customers_synced > 0 && (
                                        <Badge className="bg-green-100 text-green-700 border-0">
                                            {migrationStatus.customers_synced.toLocaleString()}{migrationStatus.total_customers_in_pos > 0 ? ` / ${migrationStatus.total_customers_in_pos.toLocaleString()}` : ''} synced
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={handleSyncCustomers} disabled={syncingCustomers} className={`${migrationStatus?.customers_synced > 0 ? 'flex-1' : 'w-full'} h-11 rounded-xl bg-blue-600 hover:bg-blue-700`} data-testid="sync-customers-btn">
                                        <Users className="w-4 h-4 mr-2" />
                                        {syncingCustomers ? "Syncing..." : migrationStatus?.customers_synced > 0 ? "Sync Again" : "Sync Customers"}
                                    </Button>
                                    {migrationStatus?.customers_synced > 0 && (
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button disabled={revertingCustomers} variant="outline" className="flex-1 h-11 rounded-xl border-red-300 text-red-600 hover:bg-red-50" data-testid="revert-customers-btn">
                                                    <RotateCcw className="w-4 h-4 mr-2" />
                                                    {revertingCustomers ? "Reverting..." : "Revert"}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Revert Customers?</AlertDialogTitle>
                                                    <AlertDialogDescription>This will delete all {migrationStatus?.customers_synced} synced customers. This action cannot be undone.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleRevertCustomers} className="bg-red-600 hover:bg-red-700">Delete Customers</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Step 2: Sync Orders */}
                        <Card className="rounded-xl border-0 shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">2</div>
                                        <div>
                                            <p className="font-medium text-[#1A1A1A]">Sync Orders</p>
                                            <p className="text-xs text-[#52525B]">Import order history from MyGenie</p>
                                        </div>
                                    </div>
                                    {migrationStatus?.orders_synced > 0 && (
                                        <Badge className="bg-green-100 text-green-700 border-0">
                                            {migrationStatus.orders_synced.toLocaleString()}{migrationStatus.total_orders_in_pos > 0 ? ` / ${migrationStatus.total_orders_in_pos.toLocaleString()}` : ''} synced
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={handleSyncOrders} disabled={syncingOrders} className={`${migrationStatus?.orders_synced > 0 ? 'flex-1' : 'w-full'} h-11 rounded-xl bg-blue-600 hover:bg-blue-700`} data-testid="sync-orders-btn">
                                        <ShoppingCart className="w-4 h-4 mr-2" />
                                        {syncingOrders ? "Syncing..." : migrationStatus?.orders_synced > 0 ? "Sync Again" : "Sync Orders"}
                                    </Button>
                                    {migrationStatus?.orders_synced > 0 && (
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button disabled={revertingOrders} variant="outline" className="flex-1 h-11 rounded-xl border-red-300 text-red-600 hover:bg-red-50" data-testid="revert-orders-btn">
                                                    <RotateCcw className="w-4 h-4 mr-2" />
                                                    {revertingOrders ? "Reverting..." : "Revert"}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Revert Orders?</AlertDialogTitle>
                                                    <AlertDialogDescription>This will delete all {migrationStatus?.orders_synced} synced orders. This action cannot be undone.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleRevertOrders} className="bg-red-600 hover:bg-red-700">Delete Orders</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Step 3: Confirm */}
                        <Card className="rounded-xl border-0 shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">3</div>
                                    <div>
                                        <p className="font-medium text-[#1A1A1A]">Confirm Migration</p>
                                        <p className="text-xs text-[#52525B]">Finalize your data sync</p>
                                    </div>
                                </div>
                                <Button onClick={handleConfirmMigration} disabled={confirmingMigration || (!migrationStatus?.customers_synced && !migrationStatus?.orders_synced)} className="w-full h-11 rounded-xl bg-green-600 hover:bg-green-700" data-testid="confirm-migration-btn">
                                    <Check className="w-4 h-4 mr-2" />
                                    {confirmingMigration ? "Confirming..." : "Confirm Migration"}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </ResponsiveLayout>
    );
}
