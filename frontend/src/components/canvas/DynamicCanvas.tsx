'use client';
import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Calendar, User, Info, Mail, CheckCircle, Loader2 } from 'lucide-react';

export default function DynamicCanvas() {
  const { canvasState } = useStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleApproveAndSend = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('http://localhost:8000/api/v1/actions/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock-jwt-token'
        },
        body: JSON.stringify({
          action_type: 'send_email',
          payload: {
            to: canvasState.data.to,
            subject: canvasState.data.subject,
            body: canvasState.data.body
          }
        })
      });

      if (response.ok) {
        setIsSuccess(true);
      } else {
        console.error("Failed to send email");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset success state if view changes
  React.useEffect(() => {
    setIsSuccess(false);
  }, [canvasState.data]);

  if (!canvasState.view) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-gray-50 border-l border-gray-200">
        <Info size={48} className="mb-4 opacity-50" />
        <p>Interactive Canvas</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-50 p-8 overflow-y-auto border-l border-gray-200">
      {canvasState.view === 'EMPLOYEE_PROFILE' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
           <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
              {canvasState.data.name?.charAt(0) || <User />}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{canvasState.data.name}</h2>
              <p className="text-gray-500">{canvasState.data.role}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-y-6 gap-x-4">
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Department</div>
              <div className="text-gray-900 font-medium">{canvasState.data.department}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Manager</div>
              <div className="text-gray-900 font-medium">{canvasState.data.manager}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Email</div>
              <div className="text-gray-900 font-medium">{canvasState.data.email}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Location</div>
              <div className="text-gray-900 font-medium">{canvasState.data.location}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Salary</div>
              <div className="text-gray-900 font-medium">{canvasState.data.salary}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Hire Date</div>
              <div className="text-gray-900 font-medium">{canvasState.data.hire_date}</div>
            </div>
          </div>
        </div>
      )}

      {canvasState.view === 'LEAVE_BREAKDOWN' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
            <Calendar className="text-indigo-600" size={24} />
            <h2 className="text-2xl font-bold text-gray-900">PTO Breakdown</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100">
              <div className="text-5xl font-black text-indigo-700 mb-2">{canvasState.data.pto_remaining}</div>
              <div className="text-xs text-indigo-600 font-bold uppercase tracking-widest">Remaining</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <div className="text-5xl font-black text-gray-700 mb-2">{canvasState.data.pto_used}</div>
              <div className="text-xs text-gray-500 font-bold uppercase tracking-widest">Used</div>
            </div>
          </div>
        </div>
      )}

      {canvasState.view === 'EMAIL_DRAFT' && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
          <div className="bg-gray-800 text-white p-4 flex items-center gap-2">
            <Mail size={20} />
            <span className="font-semibold">New Message</span>
          </div>
          
          {isSuccess ? (
            <div className="p-12 flex flex-col items-center justify-center text-center">
              <CheckCircle size={64} className="text-green-500 mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Email Sent Successfully!</h3>
              <p className="text-gray-500">Your message to {canvasState.data.to} has been sent.</p>
            </div>
          ) : (
            <>
              <div className="p-6 flex-1">
                <div className="mb-4">
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">To</label>
                  <div className="text-gray-900 bg-gray-50 p-2 rounded border border-gray-200">{canvasState.data.to}</div>
                </div>
                <div className="mb-4">
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Subject</label>
                  <div className="text-gray-900 bg-gray-50 p-2 rounded border border-gray-200 font-semibold">{canvasState.data.subject}</div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Message</label>
                  <textarea 
                    className="w-full text-gray-900 bg-gray-50 p-3 rounded border border-gray-200 h-48 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    defaultValue={canvasState.data.body}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                <button 
                  className="px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-100 font-medium disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  Discard
                </button>
                <button 
                  onClick={handleApproveAndSend}
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} 
                  {isSubmitting ? 'Sending...' : 'Approve & Send'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
