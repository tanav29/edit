import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";

export const catalog = defineCatalog(schema, {
  components: {
    Card: shadcnComponentDefinitions.Card,
    Stack: shadcnComponentDefinitions.Stack,
    Heading: shadcnComponentDefinitions.Heading,
    Button: shadcnComponentDefinitions.Button,
    Input: shadcnComponentDefinitions.Input,
  },
  actions: {},
});
