"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function useWorkspace() {
  const router = useRouter(); const supabase = useMemo(()=>createClient(),[]);
  const [user,setUser]=useState<User|null>(null); const [organizationId,setOrganizationId]=useState(""); const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{const {data}=await supabase.auth.getUser(); if(!data.user){router.replace("/login");return;} setUser(data.user); const {data:member}=await supabase.from("organization_members").select("organization_id").eq("user_id",data.user.id).maybeSingle(); setOrganizationId(member?.organization_id||""); setLoading(false);})();},[router,supabase]);
  return { supabase,user,organizationId,loading,userName:user?.user_metadata?.full_name||user?.email?.split("@")[0]||"Roofnut Admin" };
}
