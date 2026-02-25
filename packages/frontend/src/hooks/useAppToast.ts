import { useToast } from '@chakra-ui/react';
import type { UseToastOptions } from '@chakra-ui/react';
import { useCallback } from 'react';

/**
 * Wrapper around Chakra useToast with sensible defaults:
 * - Always closable
 * - Auto-close after 5s (error: 8s)
 */
export default function useAppToast() {
  const toast = useToast();

  return useCallback(
    (options: UseToastOptions) => {
      const isError = options.status === 'error';
      return toast({
        isClosable: true,
        duration: isError ? 8000 : 5000,
        position: 'top-right',
        ...options,
      });
    },
    [toast],
  );
}
