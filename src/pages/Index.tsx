// src/pages/Index.tsx
import { useParams } from 'react-router-dom';
import { WorkflowBuilder } from '@/components/workflow/WorkflowBuilder';
import { getCampaignById } from '@/lib/campaignStorage';

const Index = () => {
  const { id } = useParams();
  const campaign = id ? getCampaignById(id) : null;

  return <WorkflowBuilder campaign={campaign} />;
};

export default Index;