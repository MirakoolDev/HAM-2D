"use client";

import dynamic from 'next/dynamic';
import React from 'react';

const Providers = dynamic(() => import('./providers').then(m => m.Providers), { ssr: false });

export default function DynamicProviders({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
