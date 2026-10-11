import { createContext, createElement, useContext, useEffect, useState } from 'react';
import { dashboardApi } from './api';

/** Choices for widget settings (projects, calendars, link categories), loaded once per page. */
const OptionsContext = createContext(null);

export function OptionsProvider({ children }) {
  const [options, setOptions] = useState(null);
  useEffect(() => {
    dashboardApi
      .options()
      .then((res) => setOptions(res.data))
      .catch(() => setOptions({}));
  }, []);
  return createElement(OptionsContext.Provider, { value: options }, children);
}

export const useOptions = () => useContext(OptionsContext);
