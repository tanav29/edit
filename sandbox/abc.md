i am tanav poswal

i am a engineer

# Neural Network Flowchart

```mermaid
flowchart TD
    A[Input Layer] --> B[Hidden Layer 1]
    B --> C[Hidden Layer 2]
    C --> D[Output Layer]
    
    subgraph Hidden Layers
    B
    C
    end
    
    A -->|Inputs| B
    B -->|Weights & Bias| C
    C -->|Activation| D
```

## Simple Explanation:

1. **Input Layer** - Receives data (features)
2. **Hidden Layers** - Process and learn patterns through weights & biases
3. **Output Layer** - Gives final prediction/result

### How it works:
- Inputs are multiplied by weights
- Bias is added
- Activation function decides if neuron fires
- Process repeats through all layers
