import { create } from 'zustand';

type FoundationStatus = 'checking' | 'verified' | 'unavailable';
interface FoundationViewState {
  status: FoundationStatus;
  setStatus: (status: FoundationStatus) => void;
}

// Presentation status only. There is no simulation state or clock in B01.
export const useFoundationStore = create<FoundationViewState>((set) => ({
  status: 'checking',
  setStatus: (status) => {
    set({ status });
  },
}));
