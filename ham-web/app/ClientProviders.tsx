"use client";

import { Providers } from './providers';
import React from 'react';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
