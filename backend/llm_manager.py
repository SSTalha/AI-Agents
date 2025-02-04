from langchain.llms import GoogleGenerativeAI, OpenAI # type: ignore
from langchain.prompts import PromptTemplate # type: ignore
from langchain.chains import LLMChain # type: ignore
from typing import Optional, List, Union
import os
from .enums import LLM_Type

class LLM:
    def __init__(self, llm_type: str):
        """
        Initialize the LLM instance.

        :param llm_type: The type of LLM to instantiate. Example: "gpt-4o" or "gemini-flash-8b"
        """
        self.model = self.create_llm(LLM_Type(llm_type))

    def create_llm(self, llm_type: LLM_Type):
        """
        Create and return an LLM instance based on the provided LLM_Type.
        API keys are retrieved from environment variables.
        """
        if llm_type == LLM_Type.GPT_4o:
            return OpenAI(api_key=os.getenv("OPENAI_API_KEY"), model_name=llm_type.value)
        elif llm_type == LLM_Type.GEMINI_FLASH_8b:
            return GoogleGenerativeAI(google_api_key=os.getenv("GEMINI_API_KEY"), model=llm_type.value)

    def ask(self, prompt: Union[str, List[dict]], template: Optional[str] = None, input_variables: Optional[List[str]] = None) -> str:
        """
        Ask a question to the pre-instantiated model.

        :param prompt: The prompt to send to the model. Can be a string or a list of prompt dictionaries.
        :param template: Optional template for formatting the prompt.
        :param input_variables: Optional list of input variables for the template.
        :return: The model's response.
        """
        if isinstance(prompt, list):
            prompt_str = ""
            for p in prompt:
                if "system" in p:
                    prompt_str += p["system"] + "\n\n"
                if "user" in p:
                    prompt_str += p["user"]
        else:
            prompt_str = prompt

        if template:
            if not input_variables:
                raise ValueError("input_variables must be provided if a template is used.")
            prompt_template = PromptTemplate(template=template, input_variables=input_variables)
            llm_chain = LLMChain(llm=self.model, prompt=prompt_template)
            return llm_chain.run(prompt_str)
        else:
            return self.model(prompt_str)