import { Module, Global } from '@nestjs/common';
import { getSupabaseAdmin } from './supabase.client.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_CLIENT = 'SUPABASE_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_CLIENT,
      useFactory: (): SupabaseClient => getSupabaseAdmin(),
    },
  ],
  exports: [SUPABASE_CLIENT],
})
export class SupabaseModule {}
