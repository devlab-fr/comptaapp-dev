import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export type DocumentKey = 'cgu' | 'ia';

export interface LegalDocument {
  id: string;
  key: DocumentKey;
  version: string;
  title: string;
  content_md: string;
  is_active: boolean;
  created_at: string;
}

export interface LegalAcceptance {
  id: string;
  user_id: string;
  company_id: string;
  document_key: DocumentKey;
  document_version: string;
  accepted_at: string;
  context?: Record<string, any>;
}

export function useLegalAcceptance(companyId: string | undefined) {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Record<DocumentKey, LegalDocument | null>>({
    cgu: null,
    ia: null,
  });
  const [acceptances, setAcceptances] = useState<Record<DocumentKey, LegalAcceptance | null>>({
    cgu: null,
    ia: null,
  });
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    loadDocumentsAndAcceptances();
  }, [companyId]);

  const loadDocumentsAndAcceptances = async () => {
    if (!companyId || loadingRef.current) return;

    try {
      loadingRef.current = true;
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mountedRef.current) return;

      const { data: docsData } = await supabase
        .from('legal_documents')
        .select('*')
        .eq('is_active', true)
        .in('key', ['cgu', 'ia']);

      if (!mountedRef.current) return;

      if (docsData) {
        const docsMap: Record<DocumentKey, LegalDocument | null> = { cgu: null, ia: null };
        docsData.forEach((doc) => {
          docsMap[doc.key as DocumentKey] = doc as LegalDocument;
        });
        setDocuments(docsMap);
      }

      const { data: acceptancesData } = await supabase
        .from('legal_acceptances')
        .select('*')
        .eq('user_id', user.id)
        .eq('company_id', companyId)
        .in('document_key', ['cgu', 'ia']);

      if (!mountedRef.current) return;

      if (acceptancesData) {
        const acceptancesMap: Record<DocumentKey, LegalAcceptance | null> = { cgu: null, ia: null };
        acceptancesData.forEach((acceptance) => {
          const key = acceptance.document_key as DocumentKey;
          const currentDoc = docsData?.find(d => d.key === key);
          if (currentDoc && acceptance.document_version === currentDoc.version) {
            acceptancesMap[key] = acceptance as LegalAcceptance;
          }
        });
        setAcceptances(acceptancesMap);
      }
    } catch (error) {
      console.error('Error loading legal documents:', error);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
      loadingRef.current = false;
    }
  };

  const getActiveDoc = (key: DocumentKey): LegalDocument | null => {
    return documents[key];
  };

  const hasAccepted = (key: DocumentKey): boolean => {
    const doc = documents[key];
    const acceptance = acceptances[key];

    if (!doc || !acceptance) return false;

    return acceptance.document_version === doc.version;
  };

  const accept = async (
    key: DocumentKey,
    version: string,
    context?: Record<string, any>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!companyId) {
      return { success: false, error: 'No company selected' };
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      const { error } = await supabase
        .from('legal_acceptances')
        .insert({
          user_id: user.id,
          company_id: companyId,
          document_key: key,
          document_version: version,
          context: context || null,
        });

      if (error) {
        console.error('Error accepting document:', error);
        return { success: false, error: error.message };
      }

      const optimisticAcceptance: LegalAcceptance = {
        id: 'temp-' + Date.now(),
        user_id: user.id,
        company_id: companyId,
        document_key: key,
        document_version: version,
        accepted_at: new Date().toISOString(),
        context: context || undefined,
      };

      setAcceptances(prev => ({
        ...prev,
        [key]: optimisticAcceptance,
      }));

      loadingRef.current = false;
      await loadDocumentsAndAcceptances();

      return { success: true };
    } catch (error) {
      console.error('Error accepting document:', error);
      return { success: false, error: String(error) };
    }
  };

  return {
    loading,
    documents,
    acceptances,
    getActiveDoc,
    hasAccepted,
    accept,
    refresh: loadDocumentsAndAcceptances,
  };
}
