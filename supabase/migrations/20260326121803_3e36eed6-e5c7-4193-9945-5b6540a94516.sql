-- Allow users to delete their own conversations
CREATE POLICY "Users can delete own conversations"
ON public.conversations
FOR DELETE
TO public
USING (auth.uid() = user_id);

-- Allow users to delete messages in their own conversations
CREATE POLICY "Users can delete messages in own conversations"
ON public.messages
FOR DELETE
TO public
USING (EXISTS (
  SELECT 1 FROM conversations c
  WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()
));

-- Allow users to delete own suggestions
CREATE POLICY "Users can delete own suggestions"
ON public.suggestions
FOR DELETE
TO public
USING (auth.uid() = user_id);