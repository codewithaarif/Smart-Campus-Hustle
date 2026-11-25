import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { getInstitutionName } from '../../config/university';
import { CreditCard, CheckCircle2, ShieldCheck, X, FileText, Lock, QrCode } from 'lucide-react';

interface RazorpayModalProps {
  isOpen: boolean;
  onClose: () => void;
  feeDue: {
    id: string;
    fee_type: string;
    balance_amount: number;
    academic_year: string;
  } | null;
  onPaymentSuccess: () => void;
}

export const RazorpayModal: React.FC<RazorpayModalProps> = ({ isOpen, onClose, feeDue, onPaymentSuccess }) => {
  const { tenant } = useAuth();
  const { addNotification } = useNotifications();

  const [checkoutMode, setCheckoutMode] = useState<'CHECKING' | 'LOCAL_MOCK' | 'RAZORPAY'>('CHECKING');
  const [processing, setProcessing] = useState(false);
  const [completedReceipt, setCompletedReceipt] = useState<any | null>(null);

  if (!isOpen || !feeDue) return null;

  const completePayment = async (orderId: string, paymentId: string, signature: string) => {
    const verifyRes = await fetch('/api/finance/razorpay/verify-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenant?.id || 'tenant_apex',
        'Authorization': `Bearer ${localStorage.getItem('smart_campus_token')}`
      },
      body: JSON.stringify({ orderId, paymentId, signature })
    });
    const receipt = await verifyRes.json();
    if (!verifyRes.ok || !receipt.success) {
      throw new Error(receipt.message || receipt.error || 'Payment verification failed.');
    }
    setCompletedReceipt(receipt);
    addNotification(
      'Fee Payment Successful',
      `₹${Number(receipt.amount).toLocaleString()} cleared for ${feeDue?.fee_type}. Receipt #${receipt.receiptNumber} issued.`,
      'SUCCESS'
    );
    onPaymentSuccess();
  };

  const loadRazorpayCheckout = async () => {
    if ((window as any).Razorpay) return;
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Razorpay Checkout could not be loaded.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded.'));
      document.body.appendChild(script);
    });
  };

  const handlePayNow = async () => {
    setProcessing(true);
    try {
      const createRes = await fetch('/api/finance/razorpay/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenant?.id || 'tenant_apex',
          'Authorization': `Bearer ${localStorage.getItem('smart_campus_token')}`
        },
        body: JSON.stringify({ feeDueId: feeDue.id })
      });
      const orderData = await createRes.json();
      if (!createRes.ok || !orderData.success) {
        throw new Error(orderData.message || orderData.error || 'Could not create payment order.');
      }

      setCheckoutMode(orderData.mockMode === true ? 'LOCAL_MOCK' : 'RAZORPAY');
      if (orderData.mockMode === true) {
        // Explicit local-only mock flow. The server rejects this token in production.
        await new Promise((resolve) => setTimeout(resolve, 400));
        const mockPaymentId = 'pay_mock_' + crypto.randomUUID();
        await completePayment(orderData.orderId, mockPaymentId, 'MOCK_APPROVED');
        return;
      }

      await loadRazorpayCheckout();
      const RazorpayConstructor = (window as any).Razorpay;
      if (!RazorpayConstructor) throw new Error('Razorpay Checkout is unavailable.');

      const checkout = new RazorpayConstructor({
        key: orderData.keyId,
        amount: orderData.amountPaise,
        currency: orderData.currency,
        name: getInstitutionName(tenant?.id, tenant?.name),
        description: feeDue.fee_type.replaceAll('_', ' '),
        order_id: orderData.orderId,
        handler: async (response: any) => {
          setProcessing(true);
          try {
            await completePayment(
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature
            );
          } catch (error: any) {
            alert('Payment verification failed: ' + (error?.message || 'Unknown error'));
          } finally {
            setProcessing(false);
          }
        },
        modal: {
          ondismiss: () => setProcessing(false)
        },
        theme: { color: '#2563eb' }
      });
      checkout.open();
    } catch (error: any) {
      alert('Payment processing failed: ' + (error?.message || 'Unknown error'));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Razorpay Brand Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black text-xl">
              ₹
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-wide">{checkoutMode === 'LOCAL_MOCK' ? 'Local payment simulation' : 'Razorpay Checkout'}</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500 text-white font-bold">
                  {checkoutMode === 'LOCAL_MOCK' ? 'LOCAL MOCK' : checkoutMode === 'RAZORPAY' ? 'GATEWAY' : 'CONNECTING'}
                </span>
              </div>
              <div className="text-xs text-blue-200">{getInstitutionName(tenant?.id, tenant?.name)}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white/80">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {!completedReceipt ? (
            <div className="space-y-5">
              {/* Amount Banner */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 font-medium">Fee Category</span>
                  <div className="text-sm font-bold text-slate-900">{feeDue.fee_type.replace('_', ' ')}</div>
                  <div className="text-[11px] text-slate-400">Year: {feeDue.academic_year}</div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 font-medium">Payable Balance</span>
                  <div className="text-2xl font-black text-campus-700">
                    ₹{feeDue.balance_amount.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-900">
                <div className="font-bold">Choose a payment method in the secure checkout</div>
                <p className="mt-1 text-blue-800">UPI, card, and net-banking options are provided by the configured payment gateway. No card or UPI details are entered into this campus portal.</p>
              </div>

              {/* Pay Button */}
              <button
                onClick={handlePayNow}
                disabled={processing}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-campus-600 to-indigo-600 hover:from-campus-700 hover:to-indigo-700 active:scale-98 text-white font-bold text-sm shadow-lg shadow-campus-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Preparing secure checkout...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>{checkoutMode === 'LOCAL_MOCK' ? 'Simulate payment of ' : 'Continue to pay '}₹{feeDue.balance_amount.toLocaleString()}</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Digital Receipt Card */
            <div className="text-center py-4 space-y-4 animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">{completedReceipt.paymentMode === 'MOCK' ? 'Simulation Recorded' : 'Payment Captured'}</h3>
                <p className="text-xs text-slate-500">Transaction completed via {completedReceipt.paymentMode === 'MOCK' ? 'local development simulation' : 'Razorpay'}</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Receipt #:</span>
                  <span className="font-mono font-bold text-slate-900">{completedReceipt.receiptNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount Paid:</span>
                  <span className="font-bold text-emerald-600">₹{completedReceipt.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment ID:</span>
                  <span className="font-mono text-slate-700">{completedReceipt.paymentId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Timestamp:</span>
                  <span className="text-slate-600">{new Date(completedReceipt.paidAt).toLocaleTimeString()}</span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 transition-colors"
              >
                Done & Return to Ledger
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
