import {
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerCloseButton,
  Button,
  Text,
  VStack,
  Box,
  Heading,
  useDisclosure,
} from '@chakra-ui/react';
import { BookOpen } from 'lucide-react';
import { GLOSSARY } from '../utils/glossary';

/**
 * "Glossary" button + side drawer listing every term defined in
 * src/utils/glossary.ts. Mounted once near the page header so all tabs
 * share a consistent reference panel.
 */
export function GlossaryDrawer() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const entries = Object.values(GLOSSARY).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        leftIcon={<BookOpen size={14} />}
        onClick={onOpen}
        aria-label="Open glossary"
      >
        Glossary
      </Button>

      <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="sm">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>
            <Heading size="md">Glossary</Heading>
            <Text fontSize="xs" color="gray.500" fontWeight="normal" mt={1}>
              Statistical and analysis terms used across this report.
            </Text>
          </DrawerHeader>
          <DrawerBody>
            <VStack align="stretch" spacing={5} pb={6}>
              {entries.map((entry) => (
                <Box key={entry.label}>
                  <Text fontWeight="bold" fontSize="sm">
                    {entry.label}
                  </Text>
                  <Text fontSize="sm" color="gray.700" mt={0.5}>
                    {entry.short}
                  </Text>
                  {entry.long && (
                    <Text fontSize="xs" color="gray.600" mt={1.5} lineHeight="1.5">
                      {entry.long}
                    </Text>
                  )}
                </Box>
              ))}
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}
