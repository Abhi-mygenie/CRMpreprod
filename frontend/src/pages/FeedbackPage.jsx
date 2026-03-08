import { useState, useEffect } from "react";
import { toast } from "sonner";
import { MessageSquare, Plus, Star, Phone, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MobileLayout } from "@/components/MobileLayout";

export default function FeedbackPage() {
    const { api } = useAuth();
    const [feedbackList, setFeedbackList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newFeedback, setNewFeedback] = useState({ customer_name: "", customer_phone: "", rating: 5, message: "" });
    const [submitting, setSubmitting] = useState(false);

    const fetchFeedback = async () => {
        try {
            const res = await api.get("/feedback");
            setFeedbackList(res.data);
        } catch (err) {
            toast.error("Failed to load feedback");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFeedback();
    }, []);

    const handleAddFeedback = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.post("/feedback", newFeedback);
            toast.success("Feedback recorded!");
            setShowAddModal(false);
            setNewFeedback({ customer_name: "", customer_phone: "", rating: 5, message: "" });
            fetchFeedback();
        } catch (err) {
            toast.error("Failed to add feedback");
        } finally {
            setSubmitting(false);
        }
    };

    const handleResolve = async (feedbackId) => {
        try {
            await api.put(`/feedback/${feedbackId}/resolve`);
            toast.success("Feedback resolved");
            fetchFeedback();
        } catch (err) {
            toast.error("Failed to resolve");
        }
    };

    const StarRating = ({ rating, onChange, readonly = false }) => (
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    disabled={readonly}
                    onClick={() => onChange && onChange(star)}
                    className={`${readonly ? "" : "active-scale"}`}
                >
                    <Star 
                        className={`w-6 h-6 ${star <= rating ? "fill-[#329937] text-[#329937]" : "text-gray-300"}`} 
                    />
                </button>
            ))}
        </div>
    );

    return (
        <MobileLayout>
            <div className="p-4 max-w-lg mx-auto">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold text-[#1A1A1A] font-['Montserrat']" data-testid="feedback-title">
                        Feedback
                    </h1>
                    <Button 
                        onClick={() => setShowAddModal(true)}
                        className="bg-[#F26B33] hover:bg-[#D85A2A] rounded-full h-10 px-4"
                        data-testid="add-feedback-btn"
                    >
                        <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                </div>

                {loading ? (
                    <div className="space-y-3">
                        {[1,2,3].map(i => (
                            <div key={i} className="stats-card animate-pulse">
                                <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                                <div className="h-3 bg-gray-200 rounded w-full"></div>
                            </div>
                        ))}
                    </div>
                ) : feedbackList.length === 0 ? (
                    <div className="empty-state">
                        <MessageSquare className="empty-state-icon" />
                        <p className="text-[#52525B]">No feedback yet</p>
                        <Button 
                            onClick={() => setShowAddModal(true)}
                            className="mt-4 bg-[#F26B33] hover:bg-[#D85A2A] rounded-full"
                        >
                            Record first feedback
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {feedbackList.map((fb) => (
                            <Card key={fb.id} className="rounded-xl border-0 shadow-sm" data-testid={`feedback-item-${fb.id}`}>
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <p className="font-medium text-[#1A1A1A]">{fb.customer_name}</p>
                                            <p className="text-sm text-[#52525B]">{fb.customer_phone}</p>
                                        </div>
                                        <Badge variant={fb.status === "resolved" ? "outline" : "default"} 
                                            className={fb.status === "pending" ? "bg-[#329937]" : ""}>
                                            {fb.status}
                                        </Badge>
                                    </div>
                                    <StarRating rating={fb.rating} readonly />
                                    {fb.message && (
                                        <p className="text-[#52525B] mt-2 text-sm">{fb.message}</p>
                                    )}
                                    <div className="flex items-center justify-between mt-3 pt-3 border-t">
                                        <p className="text-xs text-[#A1A1AA]">
                                            {new Date(fb.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </p>
                                        {fb.status === "pending" && (
                                            <Button 
                                                size="sm" 
                                                variant="outline"
                                                onClick={() => handleResolve(fb.id)}
                                                className="h-8 rounded-full text-xs"
                                                data-testid={`resolve-feedback-${fb.id}`}
                                            >
                                                <Check className="w-3 h-3 mr-1" /> Resolve
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Add Feedback Modal */}
            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent className="max-w-sm mx-4 rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="font-['Montserrat']">Record Feedback</DialogTitle>
                        <DialogDescription>Capture customer feedback</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddFeedback}>
                        <div className="space-y-4 py-4">
                            <div>
                                <Label className="form-label">Name *</Label>
                                <Input
                                    value={newFeedback.customer_name}
                                    onChange={(e) => setNewFeedback({...newFeedback, customer_name: e.target.value})}
                                    placeholder="Customer name"
                                    className="h-12 rounded-xl"
                                    required
                                    data-testid="feedback-customer-name"
                                />
                            </div>
                            <div>
                                <Label className="form-label">Phone *</Label>
                                <Input
                                    type="tel"
                                    value={newFeedback.customer_phone}
                                    onChange={(e) => setNewFeedback({...newFeedback, customer_phone: e.target.value})}
                                    placeholder="9876543210"
                                    className="h-12 rounded-xl"
                                    required
                                    data-testid="feedback-customer-phone"
                                />
                            </div>
                            <div>
                                <Label className="form-label">Rating *</Label>
                                <div className="mt-2">
                                    <StarRating 
                                        rating={newFeedback.rating} 
                                        onChange={(r) => setNewFeedback({...newFeedback, rating: r})}
                                    />
                                </div>
                            </div>
                            <div>
                                <Label className="form-label">Message</Label>
                                <Textarea
                                    value={newFeedback.message}
                                    onChange={(e) => setNewFeedback({...newFeedback, message: e.target.value})}
                                    placeholder="Customer feedback..."
                                    className="rounded-xl resize-none"
                                    rows={3}
                                    data-testid="feedback-message"
                                />
                            </div>
                        </div>
                        <DialogFooter className="gap-2">
                            <Button type="button" variant="outline" onClick={() => setShowAddModal(false)} className="rounded-full">
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                className="bg-[#F26B33] hover:bg-[#D85A2A] rounded-full"
                                disabled={submitting}
                                data-testid="submit-feedback-btn"
                            >
                                {submitting ? "Saving..." : "Save Feedback"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </MobileLayout>
    );
}
