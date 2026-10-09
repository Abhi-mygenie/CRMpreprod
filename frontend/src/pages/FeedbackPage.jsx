import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoArrowBack, IoStarOutline, IoStar } from 'react-icons/io5';
import { useRestaurantId } from '../utils/useRestaurantId';
import { useRestaurantConfig } from '../context/RestaurantConfigContext';
import { useAuth } from '../context/AuthContext';
import { crmSubmitFeedback, crmGetOrders } from '../api/services/crmService';
import toast from 'react-hot-toast';
import './FeedbackPage.css';

// CR-2026-10-03-003: feedback goes to CRM POST /scan/feedback (contract §4c), not our backend.

const FeedbackPage = () => {
  const navigate = useNavigate();
  const { restaurantId } = useRestaurantId();
  const config = useRestaurantConfig();
  const { crmToken, setRestaurantScope } = useAuth();
  const [form, setForm] = useState({ rating: 0, message: '' });
  const [hoveredStar, setHoveredStar] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [latestOrderId, setLatestOrderId] = useState(null);
  const [scopeReady, setScopeReady] = useState(false);

  // CR-2026-10-03-003: restore the diner's CRM session for this restaurant (same pattern as LandingPage/ReviewOrder)
  useEffect(() => {
    if (!restaurantId) return;
    config.fetchConfig(restaurantId);
    setScopeReady(false);
    Promise.resolve(setRestaurantScope(restaurantId)).finally(() => setScopeReady(true));
  }, [restaurantId]);

  // CR-2026-10-03-003 D7-i: attach the diner's newest order if CRM has one; failure is silent
  useEffect(() => {
    if (!crmToken) return;
    let cancelled = false;
    crmGetOrders(crmToken, 1)
      .then((d) => { if (!cancelled) setLatestOrderId(d?.orders?.[0]?.id ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [crmToken]);

  const introText = config.feedbackIntroText || "We value your opinion! Share your dining experience with us.";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.rating || !form.message.trim()) {
      toast.error('Please add a rating and a message');
      return;
    }
    setSubmitting(true);
    try {
      await crmSubmitFeedback(crmToken, {
        rating: form.rating,
        message: form.message.trim(),
        orderId: latestOrderId,
        restaurantId,
      });
      setSubmitted(true);
      toast.success('Thank you for your feedback!');
    } catch {
      toast.error('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="feedback-page" data-testid="feedback-page">
      <div className="feedback-header">
        <button className="feedback-back-btn" onClick={() => navigate(-1)} data-testid="feedback-back-btn">
          <IoArrowBack />
        </button>
        <h1 className="feedback-title">Feedback</h1>
        <div className="feedback-header-spacer" />
      </div>

      <div className="feedback-content">
        {!scopeReady ? (
          <p className="feedback-intro" data-testid="feedback-loading">Loading…</p>
        ) : !crmToken ? (
          // CR-2026-10-03-003 D2=a / D10=a: token-only until CRM CR-096 ships (CR-2026-10-07-001)
          <div className="feedback-signin" data-testid="feedback-signin-required">
            <p className="feedback-intro">
              Feedback is available to signed-in diners. Sign in from the home page by entering your phone number.
            </p>
            <button
              className="feedback-btn"
              onClick={() => navigate(`/${restaurantId}`)}
              data-testid="feedback-signin-btn"
            >
              Sign in
            </button>
          </div>
        ) : submitted ? (
          <div className="feedback-success" data-testid="feedback-success">
            <div className="feedback-success-icon">&#10003;</div>
            <h2>Thank You!</h2>
            <p>Your feedback has been submitted. We appreciate you taking the time to help us improve.</p>
            <button className="feedback-btn" onClick={() => navigate(-1)} data-testid="feedback-back-after-submit">
              Back to Menu
            </button>
          </div>
        ) : (
          <>
            <p className="feedback-intro">{introText}</p>

            <form onSubmit={handleSubmit} className="feedback-form" data-testid="feedback-form">
              <div className="feedback-field">
                <label className="feedback-label">Rating *</label>
                <div className="feedback-stars" data-testid="feedback-stars">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`feedback-star ${star <= (hoveredStar || form.rating) ? 'active' : ''}`}
                      onMouseEnter={() => setHoveredStar(star)}
                      onMouseLeave={() => setHoveredStar(0)}
                      onClick={() => setForm(p => ({ ...p, rating: star }))}
                      data-testid={`feedback-star-${star}`}
                    >
                      {star <= (hoveredStar || form.rating) ? <IoStar /> : <IoStarOutline />}
                    </button>
                  ))}
                  {form.rating > 0 && <span className="feedback-rating-text">{form.rating}/5</span>}
                </div>
              </div>

              <div className="feedback-field">
                <label className="feedback-label">Your Message *</label>
                <textarea
                  className="feedback-textarea"
                  placeholder="Tell us about your experience..."
                  rows={5}
                  value={form.message}
                  onChange={(e) => setForm(p => ({ ...p, message: e.target.value }))}
                  data-testid="feedback-message"
                />
              </div>

              <button type="submit" className="feedback-btn" disabled={submitting} data-testid="feedback-submit-btn">
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default FeedbackPage;
